import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Assessment,
  AssessmentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BulkAssessmentResponsesDto } from './dto/bulk-assessment-responses.dto';
import { AssessmentResponseItemDto } from './dto/assessment-response-item.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
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
  ) {}

  async create(createAssessmentDto: CreateAssessmentDto): Promise<AssessmentWithRelations> {
    await this.ensureCompanyExists(createAssessmentDto.companyId);
    await this.ensureAssessorIsEvaluator(createAssessmentDto.assessorId);

    const assessment = await this.prisma.assessment.create({
      data: {
        companyId: createAssessmentDto.companyId,
        assessorId: createAssessmentDto.assessorId,
        status: createAssessmentDto.status,
        startedAt: createAssessmentDto.startedAt ? new Date(createAssessmentDto.startedAt) : undefined,
        completedAt: createAssessmentDto.completedAt ? new Date(createAssessmentDto.completedAt) : undefined,
      },
    });

    return this.findOne(assessment.id);
  }

  async findAll(): Promise<AssessmentWithRelations[]> {
    return this.prisma.assessment.findMany({
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number): Promise<AssessmentWithRelations> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: this.defaultInclude,
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${id}' not found`);
    }

    return assessment;
  }

  async upsertResponses(
    assessmentId: number,
    dto: BulkAssessmentResponsesDto,
  ): Promise<AssessmentWithRelations> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, status: true, startedAt: true },
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${assessmentId}' not found`);
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
          where: {
            assessmentId,
            questionId: item.questionId,
          },
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

    return this.findOne(assessmentId);
  }

  async submitAssessment(id: number) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        report: true,
        responses: { select: { id: true } },
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${id}' not found`);
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

    if (wasSubmitted && assessment.report) {
      return {
        ...assessment.report,
        payload: this.reportService.payloadFromPersisted(assessment.report),
      };
    }

    return this.reportService.generateAndPersist(id);
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

  private async ensureCompanyExists(companyId: number): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException(`Company with id '${companyId}' not found`);
    }
  }

  private async ensureAssessorIsEvaluator(assessorId: string): Promise<void> {
    const assessor = await this.prisma.user.findUnique({
      where: { id: assessorId },
      select: { id: true, role: true },
    });

    if (!assessor) {
      throw new NotFoundException(`User with id '${assessorId}' not found`);
    }

    if (assessor.role !== Role.AVALIADOR) {
      throw new BadRequestException('assessorId must reference a user with role AVALIADOR');
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
