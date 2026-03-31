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
  ResponseType,
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
import { ScoreService } from '../score/score.service';
import { ScoreEngineItemInput } from '../score/score.types';
import { computeAssessmentQuestionScore, computeResponseScore } from './utils/response-scoring';

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
  questions?: Array<{
    id: number;
    text: string;
    category: string | null;
    order: number | null;
    responseType: string;
    options: Array<{ id: number; text: string; weight: number; order: number | null }>;
  }>;
  report?: unknown;
  responses: Array<{
    id: number;
    questionId: number | null;
    assessmentQuestionId: number | null;
    selectedOptionId: number | null;
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
    assessmentQuestion: {
      id: number;
      text: string;
      category: string;
      responseType: string;
      options: Array<{ id: number; text: string; weight: number; order: number | null }>;
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
    private readonly scoreService: ScoreService,
  ) {}

  async create(
    createAssessmentDto: CreateAssessmentDto,
    currentUser: JwtPayload,
  ): Promise<AssessmentWithRelations> {
    if (currentUser.role === Role.COLLABORATOR) {
      throw new ForbiddenException('Collaborators cannot create assessments');
    }

    if (createAssessmentDto.questionnaireTemplateId == null) {
      throw new BadRequestException(
        'Only template-based assessments are supported (questionnaireTemplateId is required)',
      );
    }

    // Contract: assessments must always be tied to a global questionnaire template
    // so the frontend can render questions/options deterministically.
    return this.createTemplateAssessment(createAssessmentDto, currentUser);
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
        questions: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: { options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
        },
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

    try {
      for (const question of template.questions) {
        const clonedQuestion = await this.prisma.assessmentQuestion.create({
          data: {
            assessmentId: assessment.id,
            text: question.text,
            category: question.category,
            order: question.sortOrder,
            responseType: question.responseType,
            weight: question.weight,
          },
        });

        for (const option of question.options) {
          await this.prisma.assessmentQuestionOption.create({
            data: {
              assessmentQuestionId: clonedQuestion.id,
              text: option.label,
              weight: Number(option.scoreValue),
              order: option.sortOrder,
            },
          });
        }
      }
    } catch (error) {
      await this.prisma.assessment.delete({
        where: { id: assessment.id },
      });
      throw error;
    }

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

  /**
   * Contract: `GET /assessments/my`
   * - only assessments of the logged user
   * - assignment status must be derived from the user's assignment + their answers
   * - must not depend on global assessment status
   */
  async findMy(currentUser: JwtPayload): Promise<
    Array<{
      id: number;
      company: { id: number; name: string; segment: string | null };
      questionnaireTemplateId: number | null;
      questionnaireTemplate: { id: number; name: string; description: string | null } | null;
      createdAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
      assignment: {
        id: number;
        status: 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED';
        submittedAt: Date | null;
      };
    }>
  > {
    const rows = await this.prisma.assessment.findMany({
      where: {
        company: userCompanyScope(currentUser.sub),
        assignments: { some: { userId: currentUser.sub } },
      },
      include: {
        company: { select: { id: true, name: true, segment: true } },
        questionnaireTemplate: {
          select: { id: true, name: true, description: true },
        },
        assignments: {
          where: { userId: currentUser.sub },
          select: { id: true, status: true, submittedAt: true },
        },
        responses: {
          where: { userId: currentUser.sub },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((a) => {
      const assignment = a.assignments[0];
      const hasAnyResponses = a.responses.length > 0;

      const assignmentStatus: 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' =
        assignment.status === AssessmentAssignmentStatus.SUBMITTED
          ? 'SUBMITTED'
          : hasAnyResponses
            ? 'IN_PROGRESS'
            : 'ASSIGNED';

      return {
        id: a.id,
        company: a.company,
        questionnaireTemplateId: a.questionnaireTemplateId,
        questionnaireTemplate: a.questionnaireTemplate,
        createdAt: a.createdAt,
        startedAt: a.startedAt,
        completedAt: a.completedAt,
        assignment: {
          id: assignment.id,
          status: assignmentStatus,
          submittedAt: assignment.submittedAt,
        },
      };
    });
  }

  async findOne(id: number, currentUser: JwtPayload): Promise<AssessmentWithRelations> {
    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      include: this.findOneInclude,
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    const masked = this.maskAssessmentForViewer(assessment as AssessmentWithRelations, currentUser);
    return this.normalizeAssessmentForContract(masked, currentUser);
  }

  async findQuestions(id: number, currentUser: JwtPayload) {
    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      select: {
        id: true,
        status: true,
        questions: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          include: {
            options: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
          },
        },
      },
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    return {
      assessmentId: assessment.id,
      status: assessment.status,
      assessmentQuestions: assessment.questions,
    };
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
        questions: { select: { id: true } },
        assignments: true,
      },
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    if (!assessment.questionnaireTemplateId) {
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

    const qIds = assessment.questions.map((q) => q.id);
    for (const qid of qIds) {
      const row = await this.prisma.assessmentResponse.findFirst({
        where: {
          assessmentId,
          assessmentQuestionId: qid,
          userId: currentUser.sub,
        },
      });
      if (!row) {
        throw new BadRequestException(
          `Missing answer for assessment question ${qid}; save all answers before submitting`,
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

    if (
      assessment.status === AssessmentStatus.SUBMITTED ||
      assessment.status === AssessmentStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot modify responses for a finalized assessment');
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

    const normalizedResponses = dto.responses.map((r) => {
      const hasLegacyQuestionId = r.questionId != null;
      const hasAssessmentQuestionId = r.assessmentQuestionId != null;

      if (hasLegacyQuestionId) {
        throw new BadRequestException(
          'Template-based assessments only accept assessmentQuestionId (cloned question id)',
        );
      }
      if (!hasAssessmentQuestionId) {
        throw new BadRequestException('Each response must set assessmentQuestionId');
      }

      return r;
    });

    const assessmentQuestionIds = new Set<number>();
    for (const r of normalizedResponses) {
      if (assessmentQuestionIds.has(r.assessmentQuestionId!)) {
        throw new BadRequestException(
          `Duplicate assessmentQuestionId ${r.assessmentQuestionId} in the same request`,
        );
      }
      assessmentQuestionIds.add(r.assessmentQuestionId!);
    }

    const clonedQuestions = await this.prisma.assessmentQuestion.findMany({
      where: {
        id: { in: [...assessmentQuestionIds] },
        assessmentId,
      },
      include: { options: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
    });

    const qById = new Map(clonedQuestions.map((q) => [q.id, q]));
    for (const id of assessmentQuestionIds) {
      const q = qById.get(id);
      if (!q) {
        throw new BadRequestException(
          `Assessment question ${id} does not belong to this assessment`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of normalizedResponses) {
        const q = qById.get(item.assessmentQuestionId!)!;
        const requiresEvidence = q.options.length === 0;
        this.assertEvidenceSatisfied(requiresEvidence, item, item.assessmentQuestionId!);

        const effectiveResponseValue =
          item.selectedOptionId != null ? String(item.selectedOptionId) : item.responseValue;
        const { normalizedValue, score, selectedOptionId } = computeAssessmentQuestionScore(
          q.responseType,
          q.options.map((o) => ({ id: o.id, weight: o.weight })),
          effectiveResponseValue,
        );
        const scoreDecimal = new Prisma.Decimal(score);

        const existing = await tx.assessmentResponse.findFirst({
          where: assessmentResponseWhereForUser(
            assessmentId,
            { id: currentUser.sub, role: currentUser.role },
            {
              assessmentQuestionId: item.assessmentQuestionId!,
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
              assessmentQuestionId: item.assessmentQuestionId!,
              selectedOptionId,
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
              assessmentQuestionId: item.assessmentQuestionId!,
              selectedOptionId,
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
      const hasAq = r.assessmentQuestionId != null;
      if (!hasQ) {
        throw new BadRequestException(
          'Each response must set only questionId for legacy assessments',
        );
      }
      if (r.questionId == null) {
        throw new BadRequestException('Legacy assessments only accept questionId');
      }
      if (hasAq) {
        throw new BadRequestException('Legacy assessments do not accept assessmentQuestionId');
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
              assessmentQuestionId: null,
              selectedOptionId: null,
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
              assessmentQuestionId: null,
              selectedOptionId: null,
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
      throw new BadRequestException('Cannot submit an assessment without responses');
    }

    if (
      assessment.status !== AssessmentStatus.COMPLETED &&
      assessment.status !== AssessmentStatus.SUBMITTED
    ) {
      await this.finalizeAssessment(id);
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

    const reportRow = await this.prisma.report.findUnique({ where: { assessmentId: id } });
    const payload = reportRow
      ? this.reportService.payloadFromPersisted(reportRow)
      : await this.assessmentCalculator.recalculate(id, {
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

  async finishAssessment(id: number, currentUser: JwtPayload) {
    if (currentUser.role !== Role.COLLABORATOR) {
      throw new ForbiddenException('Only collaborators can finish assessments');
    }

    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      include: {
        questions: {
          include: {
            options: true,
          },
        },
        answers: {
          where: { answeredBy: currentUser.sub },
          include: {
            selectedOption: true,
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (
      assessment.status === AssessmentStatus.COMPLETED ||
      assessment.status === AssessmentStatus.SUBMITTED
    ) {
      throw new BadRequestException('Assessment already finalized');
    }

    if (assessment.questions.length === 0) {
      throw new BadRequestException('Assessment has no questions');
    }

    const answerByQuestionId = new Map<number, (typeof assessment.answers)[number]>();
    for (const answer of assessment.answers) {
      if (!answerByQuestionId.has(answer.assessmentQuestionId)) {
        answerByQuestionId.set(answer.assessmentQuestionId, answer);
      }
    }

    if (answerByQuestionId.size !== assessment.questions.length) {
      throw new BadRequestException('All assessment questions must be answered before finishing');
    }

    return this.finalizeAssessment(id);
  }

  async finalizeAssessment(assessmentId: number): Promise<{
    totalScore: number;
    categoryScores: Record<string, number>;
    categoryWeights: Record<string, number>;
  }> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
        answers: {
          include: {
            assessmentQuestion: true,
            selectedOption: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (assessment.status === AssessmentStatus.SUBMITTED) {
      throw new BadRequestException('Cannot finalize a submitted assessment');
    }

    if (assessment.questions.length === 0) {
      throw new BadRequestException('Assessment has no questions');
    }

    const uniqueByQuestion = new Map<number, (typeof assessment.answers)[number]>();
    for (const answer of assessment.answers) {
      if (!uniqueByQuestion.has(answer.assessmentQuestionId)) {
        uniqueByQuestion.set(answer.assessmentQuestionId, answer);
      }
    }

    if (uniqueByQuestion.size !== assessment.questions.length) {
      throw new BadRequestException(
        'All assessment questions must be answered before finalization',
      );
    }

    const scoringItems: ScoreEngineItemInput[] = assessment.questions.map((question) => {
      const answer = uniqueByQuestion.get(question.id);
      if (!answer) {
        throw new BadRequestException(`Missing answer for question ${question.id}`);
      }

      return {
        questionId: question.id,
        category: (question.category ?? 'GOVERNANCA') as ScoreEngineItemInput['category'],
        responseType: question.responseType,
        responseValue: this.mapSelectedOptionToScoreValue(
          question.responseType,
          answer.selectedOption.weight,
          answer.selectedOption.text,
        ),
        weight: Number(question.weight),
      };
    });

    if (scoringItems.length === 0) {
      throw new BadRequestException('Cannot finalize assessment without answers');
    }

    const scoreResult = this.scoreService.compute({ items: scoringItems });

    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        score: scoreResult.totalScore,
        totalScore: new Prisma.Decimal(scoreResult.totalScore),
        status: AssessmentStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    await this.prisma.assessmentResult.upsert({
      where: { assessmentId },
      create: {
        assessmentId,
        totalScore: scoreResult.totalScore,
        categoryScores: scoreResult.categoryScores as unknown as Prisma.InputJsonValue,
        categoryWeights: scoreResult.categoryWeights as unknown as Prisma.InputJsonValue,
      },
      update: {
        totalScore: scoreResult.totalScore,
        categoryScores: scoreResult.categoryScores as unknown as Prisma.InputJsonValue,
        categoryWeights: scoreResult.categoryWeights as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      totalScore: scoreResult.totalScore,
      categoryScores: scoreResult.categoryScores,
      categoryWeights: scoreResult.categoryWeights,
    };
  }

  async getResult(assessmentId: number, currentUser: JwtPayload): Promise<{
    totalScore: number;
    categoryScores: Record<string, number>;
    categoryWeights: Record<string, number>;
  }> {
    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(assessmentId, { id: currentUser.sub, role: currentUser.role }),
      select: { id: true },
    });
    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    const result = await this.prisma.assessmentResult.findUnique({
      where: { assessmentId },
    });
    if (!result) {
      throw new NotFoundException('Assessment result has not been generated yet');
    }

    return {
      totalScore: result.totalScore,
      categoryScores: result.categoryScores as Record<string, number>,
      categoryWeights: result.categoryWeights as Record<string, number>,
    };
  }

  private mapSelectedOptionToScoreValue(
    responseType: ResponseType,
    selectedWeight: number,
    selectedText: string,
  ): string {
    if (responseType === ResponseType.SCALE) {
      const value0to10 = Math.max(0, Math.min(10, Math.round(selectedWeight * 2)));
      return String(value0to10);
    }

    if (responseType === ResponseType.YES_NO) {
      const normalizedText = selectedText.trim().toUpperCase();
      if (normalizedText === 'YES' || normalizedText === 'NO') {
        return normalizedText;
      }
      return selectedWeight > 0 ? 'YES' : 'NO';
    }

    return String(selectedWeight);
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
    questions: {
      include: {
        options: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
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
        assessmentQuestion: {
          select: {
            id: true,
            text: true,
            category: true,
            responseType: true,
            options: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
          },
        },
        evidenceFiles: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  } satisfies Prisma.AssessmentInclude;

  private readonly findOneInclude = {
    company: this.listInclude.company,
    assessor: this.listInclude.assessor,
    assignments: this.listInclude.assignments,
    report: this.listInclude.report,
    questions: this.listInclude.questions,
    responses: this.listInclude.responses,
    questionnaireTemplate: {
      select: {
        id: true,
        name: true,
        description: true,
      },
    },
  } satisfies Prisma.AssessmentInclude;

  private decimalToNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }

    const maybeDecimal = value as { toNumber?: () => number };
    if (typeof maybeDecimal?.toNumber === 'function') {
      const n = maybeDecimal.toNumber();
      return Number.isFinite(n) ? n : 0;
    }

    const n = Number(value as any);
    return Number.isFinite(n) ? n : 0;
  }

  private normalizeQuestionnaireTemplateForContract(template: any): any {
    if (!template?.questions) return template;

    return {
      ...template,
      questions: template.questions.map((q: any) => ({
        ...q,
        weight: this.decimalToNumber(q.weight),
        options: Array.isArray(q.options)
          ? q.options.map((o: any) => ({
              ...o,
              score: this.decimalToNumber(o.scoreValue),
            }))
          : q.options,
      })),
    };
  }

  private normalizeAssessmentForContract(assessment: any, currentUser: JwtPayload): any {
    // Contract: frontend expects the "closed" concept after finalization.
    if (assessment?.status === AssessmentStatus.SUBMITTED) {
      assessment.status = 'CLOSED';
    }

    // Contract: answers must be only for the logged user.
    if (Array.isArray(assessment?.responses)) {
      assessment.responses = assessment.responses.filter(
        (r: any) => r.userId === currentUser.sub,
      );
    }

    if (assessment?.questionnaireTemplate) {
      assessment.questionnaireTemplate =
        this.normalizeQuestionnaireTemplateForContract(assessment.questionnaireTemplate);
    }

    if (currentUser.role === Role.COLLABORATOR && Array.isArray(assessment?.assignments)) {
      const hasAnyResponses = Array.isArray(assessment?.responses) && assessment.responses.length > 0;

      assessment.assignments = assessment.assignments.map((a: any) => ({
        ...a,
        status:
          a.status === AssessmentAssignmentStatus.SUBMITTED
            ? 'SUBMITTED'
            : hasAnyResponses
              ? 'IN_PROGRESS'
              : 'ASSIGNED',
      }));
    }

    if (Array.isArray(assessment?.responses)) {
      assessment.responses = assessment.responses.map((r: any) => {
        const normalizedQuestionId = r.questionId ?? r.assessmentQuestionId ?? null;

        return {
          ...r,
          questionId: normalizedQuestionId,
          ...(r.assessmentQuestion
            ? {
                assessmentQuestion: this.normalizeQuestionnaireTemplateForContract(
                  r.assessmentQuestion,
                ),
              }
            : {}),
        };
      });
    }

    return assessment;
  }
}
