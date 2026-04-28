import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ActionPlanPriority,
  ActionPlanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

  async create(dto: CreateActionPlanDto) {
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

  async findAll(filters: FilterActionPlanDto) {
    return this.prisma.actionPlan.findMany({
      where: {
        ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
        ...(filters.assessmentId !== undefined ? { assessmentId: filters.assessmentId } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
      },
      include: { responsible: true },
    });
  }

  async findOne(id: number) {
    const actionPlan = await this.prisma.actionPlan.findUnique({
      where: { id },
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

    return this.prisma.actionPlan.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        completedAt: dto.status === ActionPlanStatus.CONCLUIDO ? new Date() : undefined,
      },
      include: {
        assessment: true,
        company: true,
        responsible: true,
      },
    });
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

  async getDashboardStats(companyId?: number) {
    const where = companyId ? { companyId } : {};

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

  async generateFromAssessment(assessmentId: number) {
    const report = await this.prisma.report.findFirst({
      where: { assessmentId },
    });

    if (!report) {
      throw new NotFoundException(`Report for assessment '${assessmentId}' not found`);
    }

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
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
