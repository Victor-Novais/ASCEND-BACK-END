import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Assessment,
  AssessmentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  assessmentResponseWhereForUser,
  assessmentWhereForUser,
  isAdmin,
  userCompanyScope,
} from '../auth/user-scope.helper';
import { BulkAssessmentResponsesDto } from './dto/bulk-assessment-responses.dto';
import { AssessmentResponseItemDto } from './dto/assessment-response-item.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { AssessmentCalculatorService } from './assessment-calculator.service';
import { ReportService } from '../report/report.service';
import { computeResponseScore } from './utils/response-scoring';

type AssessmentWithRelations = Assessment & {
  company: {
    id: number;
    name: string;
    segment: string;
  };
  assessor: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
  };
  responses: Array<{
    id: number;
    questionId: number;
    questionVersion: number;
    responseValue: string;
    score: Prisma.Decimal;
    evidence: string | null;
    evidenceFileUrl: string | null;
    observation: string | null;
    answeredAt: Date | null;
    createdAt: Date;
    question: {
      id: number;
      text: string;
      category: string;
      responseType: string;
    };
    evidenceFiles: Array<{
      id: number;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: Date;
    }>;
  }>;
};

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService,
    private readonly assessmentCalculator: AssessmentCalculatorService,
  ) {}

  async create(
    createAssessmentDto: CreateAssessmentDto,
    currentUser: JwtPayload,
  ): Promise<AssessmentWithRelations> {
    await this.ensureCompanyAccess(createAssessmentDto.companyId, currentUser);
    const assessorId = createAssessmentDto.assessorId ?? currentUser.sub;
    await this.ensureAssessorExists(assessorId);

    const assessment = await this.prisma.assessment.create({
      data: {
        companyId: createAssessmentDto.companyId,
        assessorId,
        status: createAssessmentDto.status,
        startedAt: createAssessmentDto.startedAt ? new Date(createAssessmentDto.startedAt) : undefined,
        completedAt: createAssessmentDto.completedAt ? new Date(createAssessmentDto.completedAt) : undefined,
      },
    });

    // Keep assessment and report state synchronized from the start.
    await this.assessmentCalculator.recalculate(assessment.id, {
      sub: currentUser.sub,
      role: currentUser.role,
    });

    return this.findOne(assessment.id, currentUser);
  }

  async findAll(currentUser: JwtPayload): Promise<AssessmentWithRelations[]> {
    return this.prisma.assessment.findMany({
      where: isAdmin({ id: currentUser.sub, role: currentUser.role })
        ? undefined
        : { company: userCompanyScope(currentUser.sub) },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, currentUser: JwtPayload): Promise<AssessmentWithRelations> {
    const assessment = await this.prisma.assessment.findFirst({
      // Security: assessment access is constrained by the parent company assignment.
      where: assessmentWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      include: this.defaultInclude,
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    return assessment;
  }

  async upsertResponses(
    assessmentId: number,
    dto: BulkAssessmentResponsesDto,
    currentUser: JwtPayload,
  ): Promise<AssessmentWithRelations> {
    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(assessmentId, {
        id: currentUser.sub,
        role: currentUser.role,
      }),
      select: { id: true, status: true, startedAt: true },
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    if (assessment.status === AssessmentStatus.SUBMITTED) {
      throw new BadRequestException(
        'Cannot modify responses for a submitted assessment',
      );
    }

    const seenQuestionIds = new Set<number>();
    for (const r of dto.responses) {
      if (seenQuestionIds.has(r.questionId)) {
        throw new BadRequestException(
          `Duplicate questionId ${r.questionId} in the same request`,
        );
      }
      seenQuestionIds.add(r.questionId);
    }

    const questionIds = [...seenQuestionIds];
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        version: true,
        responseType: true,
        evidenceRequired: true,
        isActive: true,
      },
    });

    const questionById = new Map(questions.map((q) => [q.id, q]));

    for (const id of questionIds) {
      const q = questionById.get(id);
      if (!q) {
        throw new NotFoundException(`Question with id '${id}' not found`);
      }
      if (!q.isActive) {
        throw new BadRequestException(
          `Question ${id} is inactive and cannot receive responses`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.responses) {
        const question = questionById.get(item.questionId)!;
        this.assertEvidenceSatisfied(question.evidenceRequired, item);

        const { normalizedValue, score } = computeResponseScore(
          question.responseType,
          item.responseValue,
        );

        const scoreDecimal = new Prisma.Decimal(score);

        const existing = await tx.assessmentResponse.findFirst({
          // Security: response writes are guarded through assessment->company ownership.
          where: assessmentResponseWhereForUser(
            assessmentId,
            item.questionId,
            { id: currentUser.sub, role: currentUser.role },
          ),
          orderBy: { id: 'desc' },
        });

        const answeredAt = new Date();

        if (existing) {
          await tx.evidenceFile.deleteMany({
            where: { responseId: existing.id },
          });

          await tx.assessmentResponse.update({
            where: { id: existing.id },
            data: {
              questionVersion: question.version,
              responseValue: normalizedValue,
              score: scoreDecimal,
              evidence: item.evidence?.trim() || null,
              evidenceFileUrl: item.evidenceFileUrl?.trim() || null,
              observation: item.observation?.trim() || null,
              answeredAt,
            },
          });

          await this.createEvidenceFiles(tx, existing.id, item);
        } else {
          const created = await tx.assessmentResponse.create({
            data: {
              assessmentId,
              questionId: item.questionId,
              questionVersion: question.version,
              responseValue: normalizedValue,
              score: scoreDecimal,
              evidence: item.evidence?.trim() || null,
              evidenceFileUrl: item.evidenceFileUrl?.trim() || null,
              observation: item.observation?.trim() || null,
              answeredAt,
            },
          });

          await this.createEvidenceFiles(tx, created.id, item);
        }
      }

      if (assessment.status === AssessmentStatus.NOT_STARTED) {
        await tx.assessment.update({
          where: { id: assessmentId },
          data: {
            status: AssessmentStatus.IN_PROGRESS,
            startedAt: assessment.startedAt ?? new Date(),
          },
        });
      }
    });

    // Security and business rule: scoring is fully automated and recalculated on every change.
    await this.assessmentCalculator.recalculate(assessmentId, {
      sub: currentUser.sub,
      role: currentUser.role,
    });

    return this.findOne(assessmentId, currentUser);
  }

  async submitAssessment(id: number, currentUser: JwtPayload) {
    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      include: {
        report: true,
        responses: { select: { id: true } },
      },
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    if (assessment.responses.length === 0) {
      throw new BadRequestException(
        'Cannot submit an assessment without responses',
      );
    }

    const wasSubmitted = assessment.status === AssessmentStatus.SUBMITTED;

    if (!wasSubmitted) {
      await this.prisma.assessment.update({
        where: { id },
        data: {
          status: AssessmentStatus.SUBMITTED,
          completedAt: new Date(),
        },
      });
    }

    const payload = await this.assessmentCalculator.recalculate(id, {
      sub: currentUser.sub,
      role: currentUser.role,
    });
    const report = await this.prisma.report.findUnique({ where: { assessmentId: id } });
    if (!report) {
      throw new ForbiddenException('Unable to load generated report for this assessment');
    }

    if (wasSubmitted && assessment.report) {
      return {
        ...report,
        payload: this.reportService.payloadFromPersisted(report),
      };
    }

    return {
      ...report,
      payload,
    };
  }

  private assertEvidenceSatisfied(
    evidenceRequired: boolean,
    item: AssessmentResponseItemDto,
  ): void {
    if (!evidenceRequired) {
      return;
    }

    const hasText = Boolean(item.evidence?.trim());
    const hasUrl = Boolean(item.evidenceFileUrl?.trim());
    const hasFiles =
      Array.isArray(item.evidenceFiles) && item.evidenceFiles.length > 0;

    if (!hasText && !hasUrl && !hasFiles) {
      throw new BadRequestException(
        `Question ${item.questionId} requires evidence (text, file URL, or evidence files)`,
      );
    }
  }

  private async createEvidenceFiles(
    tx: Prisma.TransactionClient,
    responseId: number,
    item: AssessmentResponseItemDto,
  ): Promise<void> {
    if (!item.evidenceFiles?.length) {
      return;
    }

    await tx.evidenceFile.createMany({
      data: item.evidenceFiles.map((f) => ({
        responseId,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        fileSize: f.fileSize,
        mimeType: f.mimeType,
      })),
    });
  }

  private async ensureCompanyAccess(
    companyId: number,
    currentUser: JwtPayload,
  ): Promise<void> {
    const company = await this.prisma.company.findFirst({
      where: isAdmin({ id: currentUser.sub, role: currentUser.role })
        ? { id: companyId }
        : {
          id: companyId,
          ...userCompanyScope(currentUser.sub),
        },
      select: { id: true },
    });

    if (!company) {
      throw new ForbiddenException('You do not have access to this company');
    }
  }

  private async ensureAssessorExists(assessorId: string): Promise<void> {
    const assessor = await this.prisma.user.findUnique({
      where: { id: assessorId },
      select: { id: true },
    });

    if (!assessor) {
      throw new NotFoundException(`User with id '${assessorId}' not found`);
    }
  }

  private readonly defaultInclude = {
    company: {
      select: {
        id: true,
        name: true,
        segment: true,
      },
    },
    assessor: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    },
    responses: {
      include: {
        question: {
          select: {
            id: true,
            text: true,
            category: true,
            responseType: true,
          },
        },
        evidenceFiles: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  } satisfies Prisma.AssessmentInclude;
}
