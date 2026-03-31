import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Assessment,
  AssessmentAssignmentStatus,
  AssessmentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  assessmentResponseWhereForUser,
  assessmentWhereForUser,
  assessmentsScopeForUser,
  isAdmin,
  userCompanyScope,
} from '../auth/user-scope.helper';
import { BulkAssessmentResponsesDto } from './dto/bulk-assessment-responses.dto';
import { AssessmentResponseItemDto } from './dto/assessment-response-item.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { AssessmentCalculatorService } from './assessment-calculator.service';
import { ReportService } from '../report/report.service';
import { computeResponseScore, computeTemplateQuestionScore } from './utils/response-scoring';

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
  assignments?: Array<{
    id: number;
    userId: string;
    status: AssessmentAssignmentStatus;
    submittedAt: Date | null;
  }>;
  questionnaireTemplate?: {
    id: number;
    name: string;
    description: string | null;
    questions: Array<{
      id: number;
      text: string;
      category: string;
      responseType: string;
      sortOrder: number;
      options: Array<{ id: number; label: string; scoreValue: Prisma.Decimal; sortOrder: number }>;
    }>;
  } | null;
  report?: unknown;
  responses: Array<{
    id: number;
    questionId: number | null;
    questionTemplateId: number | null;
    userId: string | null;
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
    } | null;
    questionTemplate: {
      id: number;
      text: string;
      category: string;
      responseType: string;
      options: Array<{ id: number; label: string; scoreValue: Prisma.Decimal; sortOrder: number }>;
    } | null;
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
    if (currentUser.role === Role.COLLABORATOR) {
      throw new ForbiddenException('Collaborators cannot create assessments');
    }

    if (createAssessmentDto.questionnaireTemplateId != null) {
      return this.createTemplateAssessment(createAssessmentDto, currentUser);
    }

    await this.ensureCompanyAccess(createAssessmentDto.companyId, currentUser);
    const assessorId = createAssessmentDto.assessorId ?? currentUser.sub;
    await this.ensureAssessorExists(assessorId);

    const assessment = await this.prisma.assessment.create({
      data: {
        companyId: createAssessmentDto.companyId,
        assessorId,
        status: createAssessmentDto.status ?? AssessmentStatus.NOT_STARTED,
        startedAt: createAssessmentDto.startedAt ? new Date(createAssessmentDto.startedAt) : undefined,
        completedAt: createAssessmentDto.completedAt ? new Date(createAssessmentDto.completedAt) : undefined,
      },
    });

    await this.assessmentCalculator.recalculate(assessment.id, {
      sub: currentUser.sub,
      role: currentUser.role,
    });

    return this.findOne(assessment.id, currentUser);
  }

  private async createTemplateAssessment(
    dto: CreateAssessmentDto,
    currentUser: JwtPayload,
  ): Promise<AssessmentWithRelations> {
    await this.ensureCompanyAccess(dto.companyId, currentUser);
    const templateId = dto.questionnaireTemplateId!;

    const template = await this.prisma.questionnaireTemplate.findFirst({
      where: { id: templateId, isActive: true },
      include: {
        questions: { select: { id: true } },
      },
    });

    if (!template) {
      throw new NotFoundException('Questionnaire template not found or inactive');
    }
    if (template.questions.length === 0) {
      throw new BadRequestException('Cannot start an assessment from an empty template');
    }

    const collaborators = await this.prisma.userCompanyAssignment.findMany({
      where: {
        companyId: dto.companyId,
        user: { role: Role.COLLABORATOR },
      },
      select: { userId: true },
    });

    if (collaborators.length === 0) {
      throw new BadRequestException(
        'The company must have at least one assigned collaborator before starting this assessment',
      );
    }

    const assessment = await this.prisma.$transaction(async (tx) => {
      const a = await tx.assessment.create({
        data: {
          companyId: dto.companyId,
          assessorId: currentUser.sub,
          questionnaireTemplateId: templateId,
          status: AssessmentStatus.NOT_STARTED,
        },
      });

      await tx.assessmentAssignment.createMany({
        data: collaborators.map((c) => ({
          assessmentId: a.id,
          userId: c.userId,
        })),
      });

      return a;
    });

    return this.findOne(assessment.id, currentUser);
  }

  async findAll(currentUser: JwtPayload): Promise<AssessmentWithRelations[]> {
    const rows = await this.prisma.assessment.findMany({
      where: assessmentsScopeForUser({ id: currentUser.sub, role: currentUser.role }),
      include: this.listInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => this.maskAssessmentForViewer(a as AssessmentWithRelations, currentUser));
  }

  async findOne(id: number, currentUser: JwtPayload): Promise<AssessmentWithRelations> {
    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      include: this.findOneInclude,
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    return this.maskAssessmentForViewer(assessment as AssessmentWithRelations, currentUser);
  }

  async submitParticipantAssessment(
    assessmentId: number,
    currentUser: JwtPayload,
  ): Promise<AssessmentWithRelations> {
    if (currentUser.role !== Role.COLLABORATOR) {
      throw new ForbiddenException('Only collaborators finalize their questionnaire');
    }

    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(assessmentId, {
        id: currentUser.sub,
        role: currentUser.role,
      }),
      include: {
        questionnaireTemplate: {
          include: {
            questions: { select: { id: true } },
          },
        },
        assignments: true,
      },
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    if (!assessment.questionnaireTemplateId || !assessment.questionnaireTemplate) {
      throw new BadRequestException('This assessment does not use collaborator submissions');
    }

    if (assessment.status === AssessmentStatus.SUBMITTED) {
      throw new BadRequestException('Assessment is already closed');
    }

    const assignment = assessment.assignments.find((x) => x.userId === currentUser.sub);
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this assessment');
    }
    if (assignment.status === AssessmentAssignmentStatus.SUBMITTED) {
      throw new BadRequestException('You have already submitted your responses');
    }

    const qIds = assessment.questionnaireTemplate.questions.map((q) => q.id);
    for (const qid of qIds) {
      const row = await this.prisma.assessmentResponse.findFirst({
        where: {
          assessmentId,
          questionTemplateId: qid,
          userId: currentUser.sub,
        },
      });
      if (!row) {
        throw new BadRequestException(
          `Missing answer for question template ${qid}; save all answers before submitting`,
        );
      }
    }

    await this.prisma.assessmentAssignment.update({
      where: { id: assignment.id },
      data: {
        status: AssessmentAssignmentStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    await this.tryAutoFinalizeTemplateAssessment(assessmentId, currentUser);

    return this.findOne(assessmentId, currentUser);
  }

  private async tryAutoFinalizeTemplateAssessment(
    assessmentId: number,
    currentUser: JwtPayload,
  ): Promise<void> {
    const assigns = await this.prisma.assessmentAssignment.findMany({
      where: { assessmentId },
    });
    if (assigns.length === 0) {
      return;
    }
    const allIn = assigns.every((a) => a.status === AssessmentAssignmentStatus.SUBMITTED);
    if (!allIn) {
      return;
    }

    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: AssessmentStatus.SUBMITTED,
        completedAt: new Date(),
      },
    });

    await this.assessmentCalculator.recalculate(assessmentId, {
      sub: currentUser.sub,
      role: currentUser.role,
    });
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
      select: {
        id: true,
        status: true,
        startedAt: true,
        questionnaireTemplateId: true,
      },
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    if (assessment.status === AssessmentStatus.SUBMITTED) {
      throw new BadRequestException('Cannot modify responses for a submitted assessment');
    }

    if (assessment.questionnaireTemplateId) {
      return this.upsertTemplateResponses(assessmentId, assessment, dto, currentUser);
    }

    return this.upsertLegacyResponses(assessmentId, assessment, dto, currentUser);
  }

  private async upsertTemplateResponses(
    assessmentId: number,
    assessment: {
      id: number;
      status: AssessmentStatus;
      startedAt: Date | null;
      questionnaireTemplateId: number | null;
    },
    dto: BulkAssessmentResponsesDto,
    currentUser: JwtPayload,
  ): Promise<AssessmentWithRelations> {
    if (currentUser.role !== Role.COLLABORATOR) {
      throw new ForbiddenException(
        'Only collaborators may answer template-based assessments',
      );
    }

    const assignment = await this.prisma.assessmentAssignment.findFirst({
      where: { assessmentId, userId: currentUser.sub },
    });
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this assessment');
    }
    if (assignment.status === AssessmentAssignmentStatus.SUBMITTED) {
      throw new BadRequestException('Cannot modify answers after submission');
    }

    for (const r of dto.responses) {
      const hasQ = r.questionId != null;
      const hasT = r.questionTemplateId != null;
      if (hasQ === hasT) {
        throw new BadRequestException(
          'Each response must set exactly one of questionId or questionTemplateId',
        );
      }
      if (r.questionTemplateId == null) {
        throw new BadRequestException(
          'Template assessments only accept questionTemplateId references',
        );
      }
    }

    const templateQuestionIds = new Set<number>();
    for (const r of dto.responses) {
      if (templateQuestionIds.has(r.questionTemplateId!)) {
        throw new BadRequestException(
          `Duplicate questionTemplateId ${r.questionTemplateId} in the same request`,
        );
      }
      templateQuestionIds.add(r.questionTemplateId!);
    }

    const tQuestions = await this.prisma.questionTemplate.findMany({
      where: {
        id: { in: [...templateQuestionIds] },
        questionnaireTemplateId: assessment.questionnaireTemplateId!,
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });

    const tById = new Map(tQuestions.map((q) => [q.id, q]));
    for (const id of templateQuestionIds) {
      const q = tById.get(id);
      if (!q) {
        throw new BadRequestException(
          `Question template ${id} does not belong to this assessment template`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.responses) {
        const q = tById.get(item.questionTemplateId!)!;
        this.assertEvidenceSatisfied(q.evidenceRequired, item, item.questionTemplateId!);

        const { normalizedValue, score } = computeTemplateQuestionScore(
          q.responseType,
          q.options.map((o) => ({ id: o.id, scoreValue: o.scoreValue })),
          item.responseValue,
        );
        const scoreDecimal = new Prisma.Decimal(score);

        const existing = await tx.assessmentResponse.findFirst({
          where: assessmentResponseWhereForUser(
            assessmentId,
            { id: currentUser.sub, role: currentUser.role },
            {
              questionTemplateId: item.questionTemplateId!,
              userId: currentUser.sub,
            },
          ),
          orderBy: { id: 'desc' },
        });

        const answeredAt = new Date();

        if (existing) {
          await tx.evidenceFile.deleteMany({ where: { responseId: existing.id } });
          await tx.assessmentResponse.update({
            where: { id: existing.id },
            data: {
              questionTemplateId: item.questionTemplateId!,
              questionId: null,
              userId: currentUser.sub,
              questionVersion: 1,
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
              questionTemplateId: item.questionTemplateId!,
              questionId: null,
              userId: currentUser.sub,
              questionVersion: 1,
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

    return this.findOne(assessmentId, currentUser);
  }

  private async upsertLegacyResponses(
    assessmentId: number,
    assessment: {
      id: number;
      status: AssessmentStatus;
      startedAt: Date | null;
    },
    dto: BulkAssessmentResponsesDto,
    currentUser: JwtPayload,
  ): Promise<AssessmentWithRelations> {
    for (const r of dto.responses) {
      const hasQ = r.questionId != null;
      const hasT = r.questionTemplateId != null;
      if (hasQ === hasT) {
        throw new BadRequestException(
          'Each response must set exactly one of questionId or questionTemplateId',
        );
      }
      if (r.questionId == null) {
        throw new BadRequestException('Legacy assessments only accept questionId');
      }
    }

    const seenQuestionIds = new Set<number>();
    for (const r of dto.responses) {
      if (seenQuestionIds.has(r.questionId!)) {
        throw new BadRequestException(
          `Duplicate questionId ${r.questionId} in the same request`,
        );
      }
      seenQuestionIds.add(r.questionId!);
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
        const question = questionById.get(item.questionId!)!;
        this.assertEvidenceSatisfied(question.evidenceRequired, item, item.questionId!);

        const { normalizedValue, score } = computeResponseScore(
          question.responseType,
          item.responseValue,
        );

        const scoreDecimal = new Prisma.Decimal(score);

        const existing = await tx.assessmentResponse.findFirst({
          where: assessmentResponseWhereForUser(
            assessmentId,
            { id: currentUser.sub, role: currentUser.role },
            { questionId: item.questionId! },
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
              questionId: item.questionId!,
              questionTemplateId: null,
              userId: null,
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
              questionId: item.questionId!,
              questionTemplateId: null,
              userId: null,
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

    if (assessment.questionnaireTemplateId) {
      throw new BadRequestException(
        'Use POST /assessments/:id/participant-submit after each collaborator finishes',
      );
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

  private maskAssessmentForViewer(
    raw: AssessmentWithRelations,
    currentUser: JwtPayload,
  ): AssessmentWithRelations {
    if (currentUser.role !== Role.COLLABORATOR) {
      return raw;
    }

    const {
      totalScore: _,
      maturityLevel: __,
      report: ___,
      responses,
      assignments,
      ...rest
    } = raw;

    return {
      ...rest,
      totalScore: null,
      maturityLevel: null,
      report: null,
      assignments: assignments?.filter((a) => a.userId === currentUser.sub),
      responses: responses.filter((r) => r.userId === currentUser.sub),
    };
  }

  private assertEvidenceSatisfied(
    evidenceRequired: boolean,
    item: AssessmentResponseItemDto,
    questionRef: number,
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
        `Question ${questionRef} requires evidence (text, file URL, or evidence files)`,
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

  private readonly listInclude = {
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
    assignments: {
      select: {
        id: true,
        userId: true,
        status: true,
        submittedAt: true,
      },
    },
    questionnaireTemplate: {
      select: {
        id: true,
        name: true,
        description: true,
      },
    },
    report: true,
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
        questionTemplate: {
          select: {
            id: true,
            text: true,
            category: true,
            responseType: true,
            options: { orderBy: { sortOrder: 'asc' } },
          },
        },
        evidenceFiles: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  } satisfies Prisma.AssessmentInclude;

  /** Full template questions for answering / review on the detail screen. */
  private readonly findOneInclude = {
    company: this.listInclude.company,
    assessor: this.listInclude.assessor,
    assignments: this.listInclude.assignments,
    report: this.listInclude.report,
    responses: this.listInclude.responses,
    questionnaireTemplate: {
      include: {
        questions: {
          orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
          include: {
            options: { orderBy: { sortOrder: 'asc' as const } },
          },
        },
      },
    },
  } satisfies Prisma.AssessmentInclude;
}
