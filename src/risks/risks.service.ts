import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  RiskImpact,
  RiskProbability,
  RiskStatus,
} from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { isAdmin, userCompanyScope } from '../auth/user-scope.helper';
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

  private riskTenantFilter(currentUser?: JwtPayload): Prisma.RiskWhereInput {
    if (!currentUser || isAdmin({ id: currentUser.sub, role: currentUser.role })) {
      return {};
    }

    return {
      company: userCompanyScope(currentUser.sub),
    };
  }

  async create(dto: CreateRiskDto, currentUser?: JwtPayload) {
    const inherentProbability = dto.inherentProbability ?? dto.probability;
    const inherentImpact = dto.inherentImpact ?? dto.impact;
    const residualProbability = dto.residualProbability ?? inherentProbability;
    const residualImpact = dto.residualImpact ?? inherentImpact;

    const currentScore = this.calculateRiskScore(dto.probability, dto.impact);
    const inherentScore = this.calculateRiskScore(inherentProbability, inherentImpact);
    const residualScore = this.calculateRiskScore(residualProbability, residualImpact);

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
        riskScore: currentScore.score,
        riskLevel: currentScore.riskLevel,
        treatment: dto.treatment,
        responsibleId: dto.responsibleId,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
        assetCategory: dto.assetCategory,
        assetName: dto.assetName,
        threat: dto.threat,
        vulnerability: dto.vulnerability,
        inherentProbability,
        inherentImpact,
        inherentScore: inherentScore.score,
        existingControls: dto.existingControls,
        proposedControls: dto.proposedControls,
        residualProbability,
        residualImpact,
        residualScore: residualScore.score,
        residualLevel: residualScore.riskLevel,
      },
    });
  }

  async findAll(filters: FilterRiskDto, currentUser?: JwtPayload) {
    return this.prisma.risk.findMany({
      where: {
        ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
        ...(filters.assessmentId !== undefined ? { assessmentId: filters.assessmentId } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.riskLevel !== undefined ? { riskLevel: filters.riskLevel } : {}),
        ...(filters.category !== undefined ? { category: filters.category } : {}),
        ...this.riskTenantFilter(currentUser),
      },
    });
  }

  async findOne(id: number, currentUser?: JwtPayload) {
    const risk = await this.prisma.risk.findFirst({
      where: {
        id,
        ...this.riskTenantFilter(currentUser),
      },
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
    const inherentProbability = dto.inherentProbability ?? existing.inherentProbability ?? probability;
    const inherentImpact = dto.inherentImpact ?? existing.inherentImpact ?? impact;
    const residualProbability = dto.residualProbability ?? existing.residualProbability ?? inherentProbability;
    const residualImpact = dto.residualImpact ?? existing.residualImpact ?? inherentImpact;

    const currentScore = this.calculateRiskScore(probability, impact);
    const inherentScore = this.calculateRiskScore(inherentProbability, inherentImpact);
    const residualScore = this.calculateRiskScore(residualProbability, residualImpact);
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
        riskScore: currentScore.score,
        riskLevel: currentScore.riskLevel,
        inherentProbability,
        inherentImpact,
        inherentScore: inherentScore.score,
        residualProbability,
        residualImpact,
        residualScore: residualScore.score,
        residualLevel: residualScore.riskLevel,
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

    const payload = this.extractReportPayload(report);
    const weaknesses = this.extractWeaknessStrings(payload.weaknesses);
    const categoryScores = this.extractCategoryScores(payload.categoryScores);
    const impact = (categoryScores['SEGURANCA'] ?? 100) < 50 ? RiskImpact.ALTO : RiskImpact.MEDIO;

    const created = await Promise.all(
      weaknesses.map((weakness) => {
        const calculated = this.calculateRiskScore(RiskProbability.MEDIA, impact);
        const inherentScore = this.calculateRiskScore(RiskProbability.MEDIA, impact);

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
            riskScore: calculated.score,
            riskLevel: calculated.riskLevel,
            inherentProbability: RiskProbability.MEDIA,
            inherentImpact: impact,
            inherentScore: inherentScore.score,
            residualProbability: RiskProbability.MEDIA,
            residualImpact: impact,
            residualScore: inherentScore.score,
            residualLevel: inherentScore.riskLevel,
          },
        });
      }),
    );

    return created;
  }

  async getRiskMatrix(companyId?: number, currentUser?: JwtPayload) {
    const risks = await this.prisma.risk.findMany({
      where: {
        ...(companyId !== undefined ? { companyId } : {}),
        ...(this.riskTenantFilter(currentUser) as Prisma.RiskWhereInput),
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

  async getStats(companyId?: number, currentUser?: JwtPayload) {
    const where = {
      ...(companyId !== undefined ? { companyId } : {}),
      ...(this.riskTenantFilter(currentUser) as Prisma.RiskWhereInput),
    };

    const [total, porNivelRows, porStatusRows, porCategoriaRows, risks] = await Promise.all([
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
      this.prisma.risk.findMany({
        where,
        select: {
          inherentScore: true,
          residualScore: true,
          riskScore: true,
          probability: true,
          impact: true,
          inherentProbability: true,
          inherentImpact: true,
          residualProbability: true,
          residualImpact: true,
        },
      }),
    ]);

    const reductions = risks.map((risk) => {
      const inherentProbability = risk.inherentProbability ?? risk.probability;
      const inherentImpact = risk.inherentImpact ?? risk.impact;
      const residualProbability = risk.residualProbability ?? inherentProbability;
      const residualImpact = risk.residualImpact ?? inherentImpact;

      const inherentScore = risk.inherentScore ?? this.calculateRiskScore(inherentProbability, inherentImpact).score;
      const residualScore =
        risk.residualScore ?? this.calculateRiskScore(residualProbability, residualImpact).score;

      if (!inherentScore) {
        return 0;
      }

      return ((inherentScore - residualScore) / inherentScore) * 100;
    });

    const reductionAverage =
      reductions.length > 0
        ? Number((reductions.reduce((sum, value) => sum + value, 0) / reductions.length).toFixed(2))
        : 0;

    const inherentCritical = risks.filter((risk) => {
      const inherentProbability = risk.inherentProbability ?? risk.probability;
      const inherentImpact = risk.inherentImpact ?? risk.impact;
      const inherentScore =
        risk.inherentScore ?? this.calculateRiskScore(inherentProbability, inherentImpact).score;

      return inherentScore >= 15;
    }).length;

    const residualCritical = risks.filter((risk) => {
      const residualProbability = risk.residualProbability ?? risk.probability;
      const residualImpact = risk.residualImpact ?? risk.impact;
      const residualScore =
        risk.residualScore ?? this.calculateRiskScore(residualProbability, residualImpact).score;

      return residualScore >= 15;
    }).length;

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
      inherentCritical,
      residualCritical,
      riskReduction: reductionAverage,
    };
  }

  async exportRisks(filters: FilterRiskDto, currentUser?: JwtPayload) {
    const risks = await this.prisma.risk.findMany({
      where: {
        ...(filters.companyId !== undefined ? { companyId: filters.companyId } : {}),
        ...(filters.assessmentId !== undefined ? { assessmentId: filters.assessmentId } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.riskLevel !== undefined ? { riskLevel: filters.riskLevel } : {}),
        ...(filters.category !== undefined ? { category: filters.category } : {}),
        ...this.riskTenantFilter(currentUser),
      },
      include: {
        company: true,
        responsible: true,
      },
    });

    return risks.map((risk) => {
      const inherentProbability = risk.inherentProbability ?? risk.probability;
      const inherentImpact = risk.inherentImpact ?? risk.impact;
      const residualProbability = risk.residualProbability ?? inherentProbability;
      const residualImpact = risk.residualImpact ?? inherentImpact;

      const inherentScore =
        risk.inherentScore ?? this.calculateRiskScore(inherentProbability, inherentImpact).score;
      const residualScore =
        risk.residualScore ?? this.calculateRiskScore(residualProbability, residualImpact).score;

      return {
        'ID': risk.id,
        'Título': risk.title,
        'Descrição': risk.description,
        'Categoria': risk.category,
        'Referência de Framework': risk.frameworkRef ?? '',
        'Probabilidade': risk.probability,
        'Impacto': risk.impact,
        'Score de Risco': risk.riskScore,
        'Nível de Risco': risk.riskLevel,
        'Status': risk.status,
        'Tratamento': risk.treatment ?? '',
        'Responsável': risk.responsible?.name ?? '',
        'Empresa': risk.company?.name ?? '',
        'Categoria do Ativo': risk.assetCategory ?? '',
        'Nome do Ativo': risk.assetName ?? '',
        'Ameaça': risk.threat ?? '',
        'Vulnerabilidade': risk.vulnerability ?? '',
        'Probabilidade Inerente': inherentProbability,
        'Impacto Inerente': inherentImpact,
        'Score Inerente': inherentScore,
        'Controles Existentes': risk.existingControls ?? '',
        'Controles Propostos': risk.proposedControls ?? '',
        'Probabilidade Residual': residualProbability,
        'Impacto Residual': residualImpact,
        'Score Residual': residualScore,
        'Nível Residual': risk.residualLevel ?? this.calculateRiskScore(residualProbability, residualImpact).riskLevel,
        'Data de Revisão': risk.reviewDate ? risk.reviewDate.toISOString().slice(0, 10) : '',
      };
    });
  }

  calculateRiskScore(probability: RiskProbability, impact: RiskImpact): {
    score: number;
    riskLevel: RiskLevel;
  } {
    const probMap = { MUITO_BAIXA: 1, BAIXA: 2, MEDIA: 3, ALTA: 4, MUITO_ALTA: 5 };
    const impMap = { MUITO_BAIXO: 1, BAIXO: 2, MEDIO: 3, ALTO: 4, MUITO_ALTO: 5 };
    const score = probMap[probability] * impMap[impact];
    const riskLevel =
      score >= 20 ? 'CRITICO' : score >= 12 ? 'ALTO' : score >= 6 ? 'MEDIO' : 'BAIXO';

    return { score, riskLevel };
  }

  private calculateRisk(probability: RiskProbability, impact: RiskImpact): {
    riskScore: number;
    riskLevel: RiskLevel;
  } {
    const { score, riskLevel } = this.calculateRiskScore(probability, impact);
    return { riskScore: score, riskLevel };
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
