import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActionPlan,
  ActionPlanPriority,
  ActionPlanStatus,
  Prisma,
  QuestionCategory,
  Report,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActionPlanDto } from './dto/create-action-plan.dto';
import { FilterActionPlanDto } from './dto/filter-action-plan.dto';
import { UpdateActionPlanDto } from './dto/update-action-plan.dto';

type ActionPlanWithRelations = ActionPlan & {
  assessment: {
    id: number;
    status: string;
    companyId: number;
  };
  company: {
    id: number;
    name: string;
    segment: string;
  };
  responsible: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
};

type ReportWeakness = {
  category?: QuestionCategory;
  title?: string;
  summary?: string;
};

type DashboardStats = {
  total: number;
  porStatus: Record<ActionPlanStatus, number>;
  porPrioridade: Record<ActionPlanPriority, number>;
  vencendo_em_7_dias: number;
};

@Injectable()
export class ActionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateActionPlanDto): Promise<ActionPlanWithRelations> {
    await this.validateReferences(dto.assessmentId, dto.companyId, dto.responsibleId);

    const dueDate = this.parseFutureDueDate(dto.dueDate);

    const actionPlan = await this.prisma.actionPlan.create({
      data: {
        assessmentId: dto.assessmentId,
        companyId: dto.companyId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        frameworkRef: dto.frameworkRef,
        priority: dto.priority ?? ActionPlanPriority.MEDIA,
        status: ActionPlanStatus.PENDENTE,
        responsibleId: dto.responsibleId,
        dueDate,
        completedAt: null,
        observations: dto.observations,
      },
    });

    return this.findOne(actionPlan.id);
  }

  async findAll(filters: FilterActionPlanDto): Promise<ActionPlanWithRelations[]> {
    return this.prisma.actionPlan.findMany({
      where: {
        companyId: filters.companyId,
        assessmentId: filters.assessmentId,
        status: filters.status,
        priority: filters.priority,
        responsibleId: filters.responsibleId,
      },
      include: this.defaultInclude,
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: number): Promise<ActionPlanWithRelations> {
    const plan = await this.prisma.actionPlan.findUnique({
      where: { id },
      include: this.defaultInclude,
    });

    if (!plan) {
      throw new NotFoundException(`Action plan with id '${id}' not found`);
    }

    return plan;
  }

  async update(id: number, dto: UpdateActionPlanDto): Promise<ActionPlanWithRelations> {
    const existing = await this.prisma.actionPlan.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Action plan with id '${id}' not found`);
    }

    const assessmentId = dto.assessmentId ?? existing.assessmentId;
    const companyId = dto.companyId ?? existing.companyId;
    const responsibleId =
      dto.responsibleId !== undefined ? dto.responsibleId : existing.responsibleId;

    await this.validateReferences(assessmentId, companyId, responsibleId ?? undefined);

    const status = dto.status ?? existing.status;
    const dueDate =
      dto.dueDate !== undefined ? this.parseFutureDueDate(dto.dueDate) : existing.dueDate;
    const completedAt =
      status === ActionPlanStatus.CONCLUIDO
        ? dto.completedAt
          ? new Date(dto.completedAt)
          : existing.status === ActionPlanStatus.CONCLUIDO && existing.completedAt
            ? existing.completedAt
            : new Date()
        : dto.completedAt !== undefined
          ? new Date(dto.completedAt)
          : null;

    await this.prisma.actionPlan.update({
      where: { id },
      data: {
        assessmentId,
        companyId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        frameworkRef: dto.frameworkRef,
        priority: dto.priority,
        status,
        responsibleId,
        dueDate,
        completedAt,
        observations: dto.observations,
      },
    });

    return this.findOne(id);
  }

  async remove(id: number): Promise<ActionPlanWithRelations> {
    await this.ensureExists(id);

    await this.prisma.actionPlan.update({
      where: { id },
      data: {
        status: ActionPlanStatus.CANCELADO,
        completedAt: null,
      },
    });

    return this.findOne(id);
  }

  async findByCompany(companyId: number): Promise<{
    companyId: number;
    items: ActionPlanWithRelations[];
    stats: DashboardStats;
  }> {
    await this.ensureCompanyExists(companyId);

    const [items, stats] = await Promise.all([
      this.prisma.actionPlan.findMany({
        where: { companyId },
        include: this.defaultInclude,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      }),
      this.getDashboardStats(companyId),
    ]);

    return {
      companyId,
      items,
      stats,
    };
  }

  async getDashboardStats(companyId?: number): Promise<DashboardStats> {
    if (companyId != null) {
      await this.ensureCompanyExists(companyId);
    }

    const where: Prisma.ActionPlanWhereInput = companyId != null ? { companyId } : {};

    const [statusGroups, priorityGroups, total, dueSoon] = await Promise.all([
      this.prisma.actionPlan.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.actionPlan.groupBy({
        by: ['priority'],
        where,
        _count: { _all: true },
      }),
      this.prisma.actionPlan.count({ where }),
      this.prisma.actionPlan.count({
        where: {
          ...where,
          status: {
            in: [ActionPlanStatus.PENDENTE, ActionPlanStatus.EM_ANDAMENTO],
          },
          dueDate: {
            gte: new Date(),
            lte: this.addDays(new Date(), 7),
          },
        },
      }),
    ]);

    const porStatus: Record<ActionPlanStatus, number> = {
      PENDENTE: 0,
      EM_ANDAMENTO: 0,
      CONCLUIDO: 0,
      CANCELADO: 0,
    };
    const porPrioridade: Record<ActionPlanPriority, number> = {
      ALTA: 0,
      MEDIA: 0,
      BAIXA: 0,
    };

    for (const item of statusGroups) {
      porStatus[item.status] = item._count._all;
    }

    for (const item of priorityGroups) {
      porPrioridade[item.priority] = item._count._all;
    }

    return {
      total,
      porStatus,
      porPrioridade,
      vencendo_em_7_dias: dueSoon,
    };
  }

  async generateFromAssessment(assessmentId: number): Promise<ActionPlanWithRelations[]> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            segment: true,
          },
        },
        report: true,
        responses: {
          where: {
            questionId: { not: null },
          },
          include: {
            question: {
              select: {
                id: true,
                category: true,
                frameworkRef: true,
              },
            },
          },
          orderBy: [{ score: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${assessmentId}' not found`);
    }

    if (!assessment.report) {
      throw new BadRequestException('Assessment report not found');
    }

    const weaknesses = this.extractWeaknesses(assessment.report);

    if (weaknesses.length === 0) {
      return [];
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const items: ActionPlan[] = [];

      for (const weakness of weaknesses) {
        const category = weakness.category ?? QuestionCategory.GOVERNANCA;
        const frameworkRef =
          assessment.responses.find(
            (response) =>
              response.question?.category === category &&
              response.question.frameworkRef,
          )?.question?.frameworkRef ?? null;

        const plan = await tx.actionPlan.create({
          data: {
            assessmentId: assessment.id,
            companyId: assessment.companyId,
            title: weakness.title?.trim() || `Plano de acao para ${category}`,
            description:
              weakness.summary?.trim() ||
              `Plano de acao gerado automaticamente para a categoria ${category}.`,
            category,
            frameworkRef,
            priority: ActionPlanPriority.ALTA,
            status: ActionPlanStatus.PENDENTE,
          },
        });

        items.push(plan);
      }

      return items;
    });

    return this.prisma.actionPlan.findMany({
      where: { id: { in: created.map((item) => item.id) } },
      include: this.defaultInclude,
      orderBy: { id: 'asc' },
    });
  }

  private extractWeaknesses(report: Report): ReportWeakness[] {
    const raw = report.weaknesses as unknown;

    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((item): item is ReportWeakness => typeof item === 'object' && item !== null)
      .map((item) => ({
        category: item.category,
        title: item.title,
        summary: item.summary,
      }));
  }

  private parseFutureDueDate(dueDate?: string): Date | null {
    if (!dueDate) {
      return null;
    }

    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('dueDate must be a valid ISO date');
    }

    if (parsed.getTime() <= Date.now()) {
      throw new BadRequestException('dueDate must be a future date');
    }

    return parsed;
  }

  private async validateReferences(
    assessmentId: number,
    companyId: number,
    responsibleId?: string,
  ): Promise<void> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, companyId: true },
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${assessmentId}' not found`);
    }

    if (assessment.companyId !== companyId) {
      throw new BadRequestException('assessmentId does not belong to companyId');
    }

    await this.ensureCompanyExists(companyId);

    if (!responsibleId) {
      return;
    }

    const responsible = await this.prisma.user.findUnique({
      where: { id: responsibleId },
      select: { id: true },
    });

    if (!responsible) {
      throw new NotFoundException(`User with id '${responsibleId}' not found`);
    }
  }

  private async ensureExists(id: number): Promise<void> {
    const exists = await this.prisma.actionPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Action plan with id '${id}' not found`);
    }
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

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private readonly defaultInclude = {
    assessment: {
      select: {
        id: true,
        status: true,
        companyId: true,
      },
    },
    company: {
      select: {
        id: true,
        name: true,
        segment: true,
      },
    },
    responsible: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    },
  } satisfies Prisma.ActionPlanInclude;
}
