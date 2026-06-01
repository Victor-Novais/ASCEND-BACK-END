import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { isAdmin, userCompanyScope } from '../auth/user-scope.helper';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePdtiDto } from './dto/create-pdti.dto';
import { FilterPdtiDto } from './dto/filter-pdti.dto';
import { UpdatePdtiDto } from './dto/update-pdti.dto';

@Injectable()
export class PdtiService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePdtiDto, currentUser: JwtPayload) {
    return this.prisma.pDTI.create({
      data: {
        companyId: dto.companyId,
        assessmentId: dto.assessmentId,
        createdById: currentUser.sub,
        title: dto.title,
        year: dto.year,
        status: dto.status ?? 'RASCUNHO',
        vision: dto.vision,
        mission: dto.mission,
        strategicGoals: dto.strategicGoals,
        summary: dto.summary,
        generatedBy: currentUser.role,
      },
      include: this.defaultInclude(),
    });
  }

  async findAll(filters: FilterPdtiDto, currentUser: JwtPayload) {
    const tenantFilter = isAdmin({ id: currentUser.sub, role: currentUser.role })
      ? {}
      : { company: userCompanyScope(currentUser.sub) };

    return this.prisma.pDTI.findMany({
      where: {
        ...tenantFilter,
        ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
        ...(filters.assessmentId !== undefined ? { assessmentId: filters.assessmentId } : {}),
        ...(filters.year !== undefined ? { year: filters.year } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
      },
      include: this.defaultInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, currentUser: JwtPayload) {
    const tenantFilter = isAdmin({ id: currentUser.sub, role: currentUser.role })
      ? {}
      : { company: userCompanyScope(currentUser.sub) };

    const pdti = await this.prisma.pDTI.findFirst({
      where: {
        id,
        ...tenantFilter,
      },
      include: this.defaultInclude(),
    });

    if (!pdti) {
      throw new NotFoundException(`PDTI with id '${id}' not found`);
    }

    return pdti;
  }

  async update(id: number, dto: UpdatePdtiDto) {
    const existing = await this.prisma.pDTI.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`PDTI with id '${id}' not found`);
    }

    return this.prisma.pDTI.update({
      where: { id },
      data: dto,
      include: this.defaultInclude(),
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.pDTI.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`PDTI with id '${id}' not found`);
    }

    return this.prisma.pDTI.delete({
      where: { id },
    });
  }

  async generateFromAssessment(assessmentId: number, currentUser: JwtPayload) {
    const report = await this.prisma.report.findUnique({
      where: { assessmentId },
    });

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        companyId: true,
        totalScore: true,
        maturityLevel: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${assessmentId}' not found`);
    }

    const [risks, actionPlans] = await Promise.all([
      this.prisma.risk.findMany({
        where: { assessmentId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.actionPlan.findMany({
        where: { assessmentId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const weaknesses = report ? this.extractStrings(report.weaknesses) : [];
    const recommendations = report ? this.extractStrings(report.recommendations) : [];
    const totalScore = report ? Number(report.totalScore) : Number(assessment.totalScore ?? 0);
    const maturityLevel = report?.maturityLevel ?? assessment.maturityLevel ?? 'ARTESANAL';

    const objectiveSeeds = this.buildObjectiveSeeds(weaknesses, risks, actionPlans);
    const year = new Date().getFullYear();

    const generated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pDTI.findFirst({
        where: { assessmentId },
        include: {
          objectives: {
            select: { id: true },
          },
        },
      });

      if (existing) {
        const objectiveIds = existing.objectives.map((objective) => objective.id);

        await tx.pDTIIndicator.deleteMany({
          where: {
            OR: [{ pdtiId: existing.id }, { objectiveId: { in: objectiveIds } }],
          },
        });

        await tx.pDTIAction.deleteMany({
          where: { objectiveId: { in: objectiveIds } },
        });

        await tx.pDTIObjective.deleteMany({
          where: { pdtiId: existing.id },
        });

        await tx.pDTI.delete({
          where: { id: existing.id },
        });
      }

      const created = await tx.pDTI.create({
        data: {
          companyId: assessment.companyId,
          assessmentId,
          createdById: currentUser.sub,
          title: `PDTI ${assessment.company?.name ?? 'Empresa'} ${year}`,
          year,
          status: 'RASCUNHO',
          vision: this.buildVision(totalScore, maturityLevel),
          mission: this.buildMission(totalScore, maturityLevel),
          strategicGoals: recommendations.slice(0, 5).join(' | '),
          summary: [
            `Maturidade ${maturityLevel}`,
            `Pontuação ${totalScore.toFixed(2)}`,
            weaknesses.slice(0, 3).join(' | '),
          ]
            .filter(Boolean)
            .join(' • '),
          generatedBy: currentUser.role,
        },
      });

      for (const seed of objectiveSeeds) {
        const objective = await tx.pDTIObjective.create({
          data: {
            pdtiId: created.id,
            title: seed.title,
            description: seed.description,
            priority: seed.priority,
            status: 'ATIVO',
          },
        });

        await tx.pDTIAction.create({
          data: {
            objectiveId: objective.id,
            actionPlanId: seed.actionPlanId ?? undefined,
            title: `Ação de execução: ${seed.title}`,
            description: seed.description,
            priority: seed.priority ?? 'MEDIA',
            status: 'PLANEJADO',
            dueDate: seed.dueDate,
          },
        });
      }

      await tx.pDTIIndicator.createMany({
        data: [
          {
            pdtiId: created.id,
            name: 'Maturidade do ambiente',
            formula: 'report.totalScore',
            unit: 'pontos',
            baseline: '0',
            target: '100',
            currentValue: totalScore.toFixed(2),
            frequency: 'mensal',
          },
          {
            pdtiId: created.id,
            name: 'Riscos identificados',
            formula: 'count(risks)',
            unit: 'itens',
            baseline: '0',
            target: `${Math.max(risks.length, 1)}`,
            currentValue: `${risks.length}`,
            frequency: 'mensal',
          },
          {
            pdtiId: created.id,
            name: 'Ações em plano',
            formula: 'count(actionPlans)',
            unit: 'itens',
            baseline: '0',
            target: `${Math.max(actionPlans.length, 1)}`,
            currentValue: `${actionPlans.length}`,
            frequency: 'mensal',
          },
        ],
      });

      return tx.pDTI.findUnique({
        where: { id: created.id },
        include: this.defaultInclude(),
      });
    });

    return generated;
  }

  private buildObjectiveSeeds(
    weaknesses: string[],
    risks: Array<{ title: string; description: string; riskLevel: string }>,
    actionPlans: Array<{ id: number; title: string; description: string; priority: string; dueDate: Date | null }>,
  ) {
    const seeds = [] as Array<{
      title: string;
      description: string;
      priority?: string;
      dueDate?: Date | null;
      actionPlanId?: number;
    }>;

    weaknesses.slice(0, 3).forEach((weakness) => {
      const category = this.inferCategory(weakness);
      seeds.push({
        title: `Fortalecer ${category}`,
        description: weakness,
        priority: 'ALTA',
      });
    });

    risks.slice(0, 3).forEach((risk) => {
      seeds.push({
        title: `Mitigar risco: ${risk.title}`,
        description: risk.description || `Risco ${risk.title} identificado no plano de TI.`,
        priority: risk.riskLevel === 'CRITICO' ? 'ALTA' : 'MEDIA',
      });
    });

    actionPlans.slice(0, 3).forEach((plan) => {
      seeds.push({
        title: `Executar ação: ${plan.title}`,
        description: plan.description,
        priority: plan.priority ?? 'MEDIA',
        dueDate: plan.dueDate,
        actionPlanId: plan.id,
      });
    });

    return seeds;
  }

  private extractStrings(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (typeof item === 'object' && item !== null) {
          const candidate = item as { summary?: unknown; title?: unknown; description?: unknown; text?: unknown };

          if (typeof candidate.summary === 'string') {
            return candidate.summary;
          }

          if (typeof candidate.title === 'string') {
            return candidate.title;
          }

          if (typeof candidate.description === 'string') {
            return candidate.description;
          }

          if (typeof candidate.text === 'string') {
            return candidate.text;
          }
        }

        return null;
      })
      .filter((item): item is string => Boolean(item));
  }

  private inferCategory(text: string): string {
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    if (normalized.includes('SEGURANCA')) {
      return 'SEGURANCA';
    }

    if (normalized.includes('GOVERNANCA')) {
      return 'GOVERNANCA';
    }

    if (normalized.includes('INFRAESTRUTURA')) {
      return 'INFRAESTRUTURA';
    }

    if (normalized.includes('PROCESSO')) {
      return 'PROCESSOS';
    }

    if (normalized.includes('CULTURA')) {
      return 'CULTURA';
    }

    return 'PROCESSOS';
  }

  async export(id: number, currentUser: JwtPayload) {
    const pdti = await this.findOne(id, currentUser);

    return {
      id: pdti.id,
      title: pdti.title,
      year: pdti.year,
      status: pdti.status,
      vision: pdti.vision,
      mission: pdti.mission,
      strategicGoals: pdti.strategicGoals,
      summary: pdti.summary,
      generatedBy: pdti.generatedBy,
      createdAt: pdti.createdAt,
      updatedAt: pdti.updatedAt,
      company: pdti.company,
      assessment: pdti.assessment,
      indicators: pdti.indicators ?? [],
      objectives: (pdti.objectives ?? []).map((objective) => ({
        ...objective,
        actions: objective.actions ?? [],
        indicators: objective.indicators ?? [],
      })),
    };
  }

  private buildVision(totalScore: number, maturityLevel: string): string {
    if (totalScore >= 80) {
      return `A TI deve sustentar a estratégia da organização com governança proativa e transformação digital orientada a resultados: ${maturityLevel}.`;
    }

    return 'A TI deve evoluir para um modelo mais governado, resiliente e alinhado aos objetivos de negócio.';
  }

  private buildMission(totalScore: number, maturityLevel: string): string {
    if (totalScore >= 80) {
      return `Consolidar a maturidade ${maturityLevel} em processos críticos, segurança e entrega de valor digital.`;
    }

    return 'Fortalecer governança, segurança, capacidade operacional e alinhamento estratégico da TI.';
  }

  private defaultInclude() {
    return {
      objectives: {
        include: {
          actions: true,
          indicators: true,
        },
      },
      indicators: true,
      company: true,
      assessment: true,
      creator: true,
    };
  }
}
