import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ActionPlanPriority,
  ActionPlanStatus,
  Prisma,
} from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { isAdmin, userCompanyScope } from '../auth/user-scope.helper';
import { PrismaService } from '../prisma/prisma.service';
import { ActionPlan5W2HRow } from './dto/action-plan-5w2h.dto';
import { CreateActionPlanDto } from './dto/create-action-plan.dto';
import { FilterActionPlanDto } from './dto/filter-action-plan.dto';
import { UpdateActionPlanDto } from './dto/update-action-plan.dto';

type ReportPayload = {
  weaknesses?: unknown;
  categoryScores?: unknown;
};

@Injectable()
export class ActionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private actionPlanTenantFilter(currentUser?: JwtPayload): Prisma.ActionPlanWhereInput {
    if (!currentUser || isAdmin({ id: currentUser.sub, role: currentUser.role })) {
      return {};
    }

    return {
      company: userCompanyScope(currentUser.sub),
    };
  }

  async create(dto: CreateActionPlanDto, currentUser?: JwtPayload) {
    if (currentUser && !isAdmin({ id: currentUser.sub, role: currentUser.role })) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: dto.companyId,
          ...userCompanyScope(currentUser.sub),
        },
        select: { id: true },
      });

      if (!company) {
        throw new NotFoundException(`Company with id '${dto.companyId}' not found`);
      }
    }

    const data: Prisma.ActionPlanUncheckedCreateInput = {
      assessmentId: dto.assessmentId,
      companyId: dto.companyId,
      title: dto.title,
      description: dto.description,
      category: dto.category,
      frameworkRef: dto.frameworkRef,
      priority: dto.priority ?? ActionPlanPriority.MEDIA,
      responsibleId: dto.responsibleId,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      observations: dto.observations,
      whatObjective: dto.whatObjective,
      whyJustification: dto.whyJustification,
      whereLocation: dto.whereLocation,
      howMethod: dto.howMethod,
      howMuchCost:
        dto.howMuchCost !== undefined ? new Prisma.Decimal(dto.howMuchCost) : undefined,
      howMuchCurrency: dto.howMuchCurrency,
    };

    return this.prisma.actionPlan.create({
      data: {
        ...data,
        completedAt:
          (data as { status?: ActionPlanStatus }).status === ActionPlanStatus.CONCLUIDO
            ? new Date()
            : undefined,
      },
    });
  }

  async findAll(filters: FilterActionPlanDto, currentUser?: JwtPayload) {
    return this.prisma.actionPlan.findMany({
      where: {
        ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
        ...(filters.assessmentId !== undefined ? { assessmentId: filters.assessmentId } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
        ...this.actionPlanTenantFilter(currentUser),
      },
      include: { responsible: true },
    });
  }

  async findOne(id: number, currentUser?: JwtPayload) {
    const actionPlan = await this.prisma.actionPlan.findFirst({
      where: {
        id,
        ...this.actionPlanTenantFilter(currentUser),
      },
      include: {
        assessment: true,
        company: true,
        responsible: true,
      },
    });

    if (!actionPlan) {
      throw new NotFoundException(`Action plan with id '${id}' not found`);
    }

    return actionPlan;
  }

  async update(id: number, dto: UpdateActionPlanDto) {
    const existing = await this.prisma.actionPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Action plan with id '${id}' not found`);
    }

    const data: Prisma.ActionPlanUncheckedUpdateInput = {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      completedAt: dto.status === ActionPlanStatus.CONCLUIDO ? new Date() : undefined,
      howMuchCost:
        dto.howMuchCost !== undefined ? new Prisma.Decimal(dto.howMuchCost) : undefined,
    };

    return this.prisma.actionPlan.update({
      where: { id },
      data,
      include: {
        assessment: true,
        company: true,
        responsible: true,
      },
    });
  }

  async exportTo5W2H(filters: FilterActionPlanDto, currentUser?: JwtPayload): Promise<ActionPlan5W2HRow[]> {
    const rows = await this.prisma.actionPlan.findMany({
      where: {
        ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
        ...(filters.assessmentId !== undefined ? { assessmentId: filters.assessmentId } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
        ...this.actionPlanTenantFilter(currentUser),
      },
      include: {
        company: true,
        responsible: true,
      },
    });

    return rows.map((plan) => ({
      id: plan.id,
      oque: plan.whatObjective ?? plan.title ?? '',
      porque: plan.whyJustification ?? plan.description ?? '',
      quem: plan.responsible?.name ?? '',
      onde: plan.whereLocation ?? '',
      quando: plan.dueDate ? this.formatDate(plan.dueDate) : '',
      como: plan.howMethod ?? '',
      quantoCusta: this.formatCurrency(plan.howMuchCost, plan.howMuchCurrency),
      status: plan.status,
      prioridade: plan.priority,
      empresa: plan.company?.name ?? '',
      categoria: plan.category,
    }));
  }

  private formatDate(date: Date | string | null | undefined): string {
    if (!date) {
      return '';
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    return parsedDate.toLocaleDateString('pt-BR');
  }

  private formatCurrency(
    amount: Prisma.Decimal | number | null | undefined,
    currencyCode: string | null | undefined,
  ): string {
    if (amount === null || amount === undefined) {
      return '';
    }

    const numericAmount =
      amount instanceof Prisma.Decimal ? Number(amount.toString()) : Number(amount);

    if (Number.isNaN(numericAmount)) {
      return '';
    }

    const targetCurrency = (currencyCode ?? 'BRL').toUpperCase();

    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: targetCurrency,
      }).format(numericAmount);
    } catch {
      return `${targetCurrency} ${numericAmount.toFixed(2)}`;
    }
  }

  async remove(id: number) {
    const existing = await this.prisma.actionPlan.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Action plan with id '${id}' not found`);
    }

    return this.prisma.actionPlan.update({
      where: { id },
      data: { status: ActionPlanStatus.CANCELADO },
    });
  }

  async getDashboardStats(companyId?: number, currentUser?: JwtPayload) {
    const where = {
      ...(companyId ? { companyId } : {}),
      ...this.actionPlanTenantFilter(currentUser),
    };

    const [total, porStatus, porPrioridade, vencendo] = await Promise.all([
      this.prisma.actionPlan.count({ where }),
      this.prisma.actionPlan.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.actionPlan.groupBy({
        by: ['priority'],
        where,
        _count: { id: true },
      }),
      this.prisma.actionPlan.count({
        where: {
          ...where,
          status: {
            notIn: [ActionPlanStatus.CONCLUIDO, ActionPlanStatus.CANCELADO],
          },
          dueDate: {
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      total,
      porStatus: {
        PENDENTE: porStatus.find((item) => item.status === ActionPlanStatus.PENDENTE)?._count.id ?? 0,
        EM_ANDAMENTO:
          porStatus.find((item) => item.status === ActionPlanStatus.EM_ANDAMENTO)?._count.id ?? 0,
        CONCLUIDO:
          porStatus.find((item) => item.status === ActionPlanStatus.CONCLUIDO)?._count.id ?? 0,
        CANCELADO:
          porStatus.find((item) => item.status === ActionPlanStatus.CANCELADO)?._count.id ?? 0,
      },
      porPrioridade: {
        ALTA: porPrioridade.find((item) => item.priority === ActionPlanPriority.ALTA)?._count.id ?? 0,
        MEDIA:
          porPrioridade.find((item) => item.priority === ActionPlanPriority.MEDIA)?._count.id ?? 0,
        BAIXA:
          porPrioridade.find((item) => item.priority === ActionPlanPriority.BAIXA)?._count.id ?? 0,
      },
      vencendo,
    };
  }

  async generateFromAssessment(assessmentId: number, currentUser?: JwtPayload) {
    const report = await this.prisma.report.findFirst({
      where: { assessmentId },
    });

    if (!report) {
      throw new NotFoundException(`Report for assessment '${assessmentId}' not found`);
    }

    const assessmentWhere: Prisma.AssessmentWhereInput = currentUser && !isAdmin({ id: currentUser.sub, role: currentUser.role })
      ? {
          id: assessmentId,
          company: userCompanyScope(currentUser.sub),
        }
      : { id: assessmentId };

    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhere,
      select: { companyId: true },
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${assessmentId}' not found`);
    }

    const payload = this.extractPayload(report);
    const weaknesses = this.extractWeaknessStrings(payload.weaknesses);
    const _categoryScores = payload.categoryScores;

    const createdPlans = await Promise.all(
      weaknesses.map((weakness) =>
        this.prisma.actionPlan.create({
          data: {
            title: weakness.substring(0, 150),
            description: `Gap identificado no assessment #${assessmentId}: ${weakness}`,
            category: this.inferCategory(weakness),
            priority: ActionPlanPriority.ALTA,
            companyId: assessment.companyId,
            assessmentId,
          },
        }),
      ),
    );

    return createdPlans;
  }

  private extractPayload(report: {
    assessmentId: number;
    categoryScores: Prisma.JsonValue;
    weaknesses: Prisma.JsonValue;
    totalScore: Prisma.Decimal;
    maturityLevel: string;
    strengths: Prisma.JsonValue;
    recommendations: Prisma.JsonValue;
  }): ReportPayload {
    return {
      assessmentId: report.assessmentId,
      totalScore: Number(report.totalScore),
      maturityLevel: report.maturityLevel,
      categoryScores: report.categoryScores,
      strengths: report.strengths,
      weaknesses: report.weaknesses,
      recommendations: report.recommendations,
    } as ReportPayload;
  }

  private extractWeaknessStrings(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (typeof item === 'object' && item !== null) {
          const candidate = item as { summary?: unknown; title?: unknown };
          if (typeof candidate.summary === 'string') {
            return candidate.summary;
          }
          if (typeof candidate.title === 'string') {
            return candidate.title;
          }
        }

        return null;
      })
      .filter((item): item is string => Boolean(item));
  }

  private inferCategory(weakness: string): string {
    const normalized = weakness.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

    if (normalized.includes('SEGURANCA')) {
      return 'SEGURANCA';
    }

    if (normalized.includes('GOVERNANCA')) {
      return 'GOVERNANCA';
    }

    if (normalized.includes('INFRAESTRUTURA')) {
      return 'INFRAESTRUTURA';
    }

    if (normalized.includes('CULTURA')) {
      return 'CULTURA';
    }

    if (normalized.includes('PROCESSOS') || normalized.includes('PROCESSO')) {
      return 'PROCESSOS';
    }

    return 'PROCESSOS';
  }
}
