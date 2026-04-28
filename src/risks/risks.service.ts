import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RiskImpact,
  RiskProbability,
  RiskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { FilterRiskDto } from './dto/filter-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';

type RiskLevel = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';

type ReportPayloadLike = {
  weaknesses?: unknown;
  categoryScores?: unknown;
};

@Injectable()
export class RisksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRiskDto) {
    const calculated = this.calculateRisk(dto.probability, dto.impact);

    return this.prisma.risk.create({
      data: {
        assessmentId: dto.assessmentId,
        companyId: dto.companyId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        frameworkRef: dto.frameworkRef,
        probability: dto.probability,
        impact: dto.impact,
        riskScore: calculated.riskScore,
        riskLevel: calculated.riskLevel,
        treatment: dto.treatment,
        responsibleId: dto.responsibleId,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
      },
    });
  }

  async findAll(filters: FilterRiskDto) {
    return this.prisma.risk.findMany({
      where: {
        ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
        ...(filters.assessmentId !== undefined ? { assessmentId: filters.assessmentId } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.riskLevel !== undefined ? { riskLevel: filters.riskLevel } : {}),
        ...(filters.category !== undefined ? { category: filters.category } : {}),
      },
    });
  }

  async findOne(id: number) {
    const risk = await this.prisma.risk.findUnique({
      where: { id },
      include: {
        assessment: true,
        company: true,
        responsible: true,
      },
    });

    if (!risk) {
      throw new NotFoundException(`Risk with id '${id}' not found`);
    }

    return risk;
  }

  async update(id: number, dto: UpdateRiskDto) {
    const existing = await this.prisma.risk.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Risk with id '${id}' not found`);
    }

    const probability = dto.probability ?? existing.probability;
    const impact = dto.impact ?? existing.impact;
    const calculated = this.calculateRisk(probability, impact);
    const nextStatus = dto.status ?? existing.status;
    const shouldClose =
      nextStatus === RiskStatus.MITIGADO ||
      nextStatus === RiskStatus.ACEITO ||
      nextStatus === RiskStatus.TRANSFERIDO;

    return this.prisma.risk.update({
      where: { id },
      data: {
        ...dto,
        probability,
        impact,
        riskScore: calculated.riskScore,
        riskLevel: calculated.riskLevel,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
        closedAt: shouldClose ? new Date() : undefined,
      },
      include: {
        assessment: true,
        company: true,
        responsible: true,
      },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.risk.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Risk with id '${id}' not found`);
    }

    return this.prisma.risk.delete({
      where: { id },
    });
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

    const payload = this.extractReportPayload(report);
    const weaknesses = this.extractWeaknessStrings(payload.weaknesses);
    const categoryScores = this.extractCategoryScores(payload.categoryScores);
    const impact = (categoryScores['SEGURANCA'] ?? 100) < 50 ? RiskImpact.ALTO : RiskImpact.MEDIO;

    const created = await Promise.all(
      weaknesses.map((weakness) => {
        const calculated = this.calculateRisk(RiskProbability.MEDIA, impact);

        return this.prisma.risk.create({
          data: {
            assessmentId,
            companyId: assessment.companyId,
            title: weakness.slice(0, 150),
            description: weakness,
            category: this.inferCategory(weakness),
            frameworkRef: '',
            probability: RiskProbability.MEDIA,
            impact,
            riskScore: calculated.riskScore,
            riskLevel: calculated.riskLevel,
          },
        });
      }),
    );

    return created;
  }

  async getRiskMatrix(companyId?: number) {
    const risks = await this.prisma.risk.findMany({
      where: {
        ...(companyId !== undefined ? { companyId } : {}),
        status: {
          notIn: [RiskStatus.MITIGADO, RiskStatus.ACEITO, RiskStatus.TRANSFERIDO],
        },
      },
      select: {
        probability: true,
        impact: true,
      },
    });

    const matrix = Array.from({ length: 5 }, (_, probabilityIndex) =>
      Array.from({ length: 5 }, (_, impactIndex) => ({
        probability: probabilityIndex + 1,
        impact: impactIndex + 1,
        count: 0,
      })),
    ).flat();

    for (const risk of risks) {
      const probability = this.enumToWeight(risk.probability);
      const impact = this.enumToWeight(risk.impact);
      const cell = matrix.find((item) => item.probability === probability && item.impact === impact);

      if (cell) {
        cell.count += 1;
      }
    }

    return matrix;
  }

  async getStats(companyId?: number) {
    const where = companyId !== undefined ? { companyId } : {};

    const [total, porNivelRows, porStatusRows, porCategoriaRows] = await Promise.all([
      this.prisma.risk.count({ where }),
      this.prisma.risk.groupBy({
        by: ['riskLevel'],
        where,
        _count: { riskLevel: true },
      }),
      this.prisma.risk.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.prisma.risk.groupBy({
        by: ['category'],
        where,
        _count: { category: true },
      }),
    ]);

    return {
      total,
      porNivel: {
        CRITICO: porNivelRows.find((item) => item.riskLevel === 'CRITICO')?._count.riskLevel ?? 0,
        ALTO: porNivelRows.find((item) => item.riskLevel === 'ALTO')?._count.riskLevel ?? 0,
        MEDIO: porNivelRows.find((item) => item.riskLevel === 'MEDIO')?._count.riskLevel ?? 0,
        BAIXO: porNivelRows.find((item) => item.riskLevel === 'BAIXO')?._count.riskLevel ?? 0,
      },
      porStatus: {
        IDENTIFICADO:
          porStatusRows.find((item) => item.status === RiskStatus.IDENTIFICADO)?._count.status ?? 0,
        EM_TRATAMENTO:
          porStatusRows.find((item) => item.status === RiskStatus.EM_TRATAMENTO)?._count.status ?? 0,
        MITIGADO: porStatusRows.find((item) => item.status === RiskStatus.MITIGADO)?._count.status ?? 0,
        ACEITO: porStatusRows.find((item) => item.status === RiskStatus.ACEITO)?._count.status ?? 0,
        TRANSFERIDO:
          porStatusRows.find((item) => item.status === RiskStatus.TRANSFERIDO)?._count.status ?? 0,
      },
      porCategoria: {
        GOVERNANCA:
          porCategoriaRows.find((item) => item.category === 'GOVERNANCA')?._count.category ?? 0,
        SEGURANCA:
          porCategoriaRows.find((item) => item.category === 'SEGURANCA')?._count.category ?? 0,
        PROCESSOS:
          porCategoriaRows.find((item) => item.category === 'PROCESSOS')?._count.category ?? 0,
        INFRAESTRUTURA:
          porCategoriaRows.find((item) => item.category === 'INFRAESTRUTURA')?._count.category ?? 0,
        CULTURA: porCategoriaRows.find((item) => item.category === 'CULTURA')?._count.category ?? 0,
      },
    };
  }

  private calculateRisk(probability: RiskProbability, impact: RiskImpact): {
    riskScore: number;
    riskLevel: RiskLevel;
  } {
    const probMap = { MUITO_BAIXA: 1, BAIXA: 2, MEDIA: 3, ALTA: 4, MUITO_ALTA: 5 };
    const impMap = { MUITO_BAIXO: 1, BAIXO: 2, MEDIO: 3, ALTO: 4, MUITO_ALTO: 5 };
    const score = probMap[probability] * impMap[impact];
    const level = score >= 20 ? 'CRITICO' : score >= 12 ? 'ALTO' : score >= 6 ? 'MEDIO' : 'BAIXO';
    return { riskScore: score, riskLevel: level };
  }

  private extractReportPayload(report: {
    weaknesses: Prisma.JsonValue;
    categoryScores: Prisma.JsonValue;
  }): ReportPayloadLike {
    return {
      weaknesses: report.weaknesses,
      categoryScores: report.categoryScores,
    };
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
          const maybeItem = item as { summary?: unknown; title?: unknown };
          if (typeof maybeItem.summary === 'string') {
            return maybeItem.summary;
          }
          if (typeof maybeItem.title === 'string') {
            return maybeItem.title;
          }
        }

        return null;
      })
      .filter((item): item is string => item !== null);
  }

  private extractCategoryScores(raw: unknown): Record<string, number> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, typeof value === 'number' ? value : Number(value) || 0]),
    );
  }

  private inferCategory(weakness: string): string {
    const normalized = weakness.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    if (normalized.includes('segur')) {
      return 'SEGURANCA';
    }
    if (normalized.includes('govern')) {
      return 'GOVERNANCA';
    }
    if (normalized.includes('infra')) {
      return 'INFRAESTRUTURA';
    }
    if (normalized.includes('cultur')) {
      return 'CULTURA';
    }
    if (normalized.includes('process')) {
      return 'PROCESSOS';
    }

    return 'PROCESSOS';
  }

  private enumToWeight(value: RiskProbability | RiskImpact): number {
    const map: Record<RiskProbability | RiskImpact, number> = {
      MUITO_BAIXA: 1,
      BAIXA: 2,
      MEDIA: 3,
      ALTA: 4,
      MUITO_ALTA: 5,
      MUITO_BAIXO: 1,
      BAIXO: 2,
      MEDIO: 3,
      ALTO: 4,
      MUITO_ALTO: 5,
    };

    return map[value];
  }
}
