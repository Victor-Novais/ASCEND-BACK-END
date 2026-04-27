import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  QuestionCategory,
  Report,
  Risk,
  RiskImpact,
  RiskProbability,
  RiskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { FilterRiskDto } from './dto/filter-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';

type RiskWithRelations = Risk & {
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

type RiskStats = {
  total: number;
  porNivel: Record<'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO', number>;
  porStatus: Record<RiskStatus, number>;
  porCategoria: Record<QuestionCategory, number>;
};

type RiskMatrixCell = {
  probability: RiskProbability;
  impact: RiskImpact;
  count: number;
};

type RiskMatrix = Record<RiskProbability, Record<RiskImpact, number>>;

const PROBABILITY_VALUES: Record<RiskProbability, number> = {
  MUITO_BAIXA: 1,
  BAIXA: 2,
  MEDIA: 3,
  ALTA: 4,
  MUITO_ALTA: 5,
};

const IMPACT_VALUES: Record<RiskImpact, number> = {
  MUITO_BAIXO: 1,
  BAIXO: 2,
  MEDIO: 3,
  ALTO: 4,
  MUITO_ALTO: 5,
};

@Injectable()
export class RisksService {
  constructor(private readonly prisma: PrismaService) {}

  calculateRiskScore(probability: RiskProbability, impact: RiskImpact): {
    score: number;
    riskLevel: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';
  } {
    const score = PROBABILITY_VALUES[probability] * IMPACT_VALUES[impact];

    if (score >= 20) {
      return { score, riskLevel: 'CRITICO' };
    }
    if (score >= 12) {
      return { score, riskLevel: 'ALTO' };
    }
    if (score >= 6) {
      return { score, riskLevel: 'MEDIO' };
    }
    return { score, riskLevel: 'BAIXO' };
  }

  async create(dto: CreateRiskDto): Promise<RiskWithRelations> {
    await this.validateReferences(dto.assessmentId, dto.companyId, dto.responsibleId);
    const reviewDate = this.parseFutureReviewDate(dto.reviewDate);
    const calculated = this.calculateRiskScore(dto.probability, dto.impact);

    const risk = await this.prisma.risk.create({
      data: {
        assessmentId: dto.assessmentId,
        companyId: dto.companyId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        frameworkRef: dto.frameworkRef,
        probability: dto.probability,
        impact: dto.impact,
        riskScore: calculated.score,
        riskLevel: calculated.riskLevel,
        status: RiskStatus.IDENTIFICADO,
        treatment: dto.treatment,
        responsibleId: dto.responsibleId,
        reviewDate,
      },
    });

    return this.findOne(risk.id);
  }

  async findAll(filters: FilterRiskDto): Promise<RiskWithRelations[]> {
    return this.prisma.risk.findMany({
      where: {
        companyId: filters.companyId,
        assessmentId: filters.assessmentId,
        status: filters.status,
        riskLevel: filters.riskLevel,
        category: filters.category,
      },
      include: this.defaultInclude,
      orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: number): Promise<RiskWithRelations> {
    const risk = await this.prisma.risk.findUnique({
      where: { id },
      include: this.defaultInclude,
    });

    if (!risk) {
      throw new NotFoundException(`Risk with id '${id}' not found`);
    }

    return risk;
  }

  async update(id: number, dto: UpdateRiskDto): Promise<RiskWithRelations> {
    const existing = await this.prisma.risk.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Risk with id '${id}' not found`);
    }

    const assessmentId = dto.assessmentId ?? existing.assessmentId;
    const companyId = dto.companyId ?? existing.companyId;
    const responsibleId =
      dto.responsibleId !== undefined ? dto.responsibleId : existing.responsibleId;

    await this.validateReferences(assessmentId, companyId, responsibleId ?? undefined);

    const probability = dto.probability ?? existing.probability;
    const impact = dto.impact ?? existing.impact;
    const calculated = this.calculateRiskScore(probability, impact);
    const status = dto.status ?? existing.status;
    const reviewDate =
      dto.reviewDate !== undefined ? this.parseFutureReviewDate(dto.reviewDate) : existing.reviewDate;

    const shouldClose =
      status === RiskStatus.MITIGADO ||
      status === RiskStatus.ACEITO ||
      status === RiskStatus.TRANSFERIDO;
    const closedAt = shouldClose
      ? dto.closedAt
        ? new Date(dto.closedAt)
        : existing.closedAt ?? new Date()
      : dto.closedAt !== undefined
        ? new Date(dto.closedAt)
        : null;

    await this.prisma.risk.update({
      where: { id },
      data: {
        assessmentId,
        companyId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        frameworkRef: dto.frameworkRef,
        probability,
        impact,
        riskScore: calculated.score,
        riskLevel: calculated.riskLevel,
        status,
        treatment: dto.treatment,
        responsibleId,
        reviewDate,
        closedAt,
      },
    });

    return this.findOne(id);
  }

  async remove(id: number): Promise<Risk> {
    await this.ensureExists(id);
    return this.prisma.risk.delete({ where: { id } });
  }

  async generateFromAssessment(assessmentId: number): Promise<RiskWithRelations[]> {
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
      const items: Risk[] = [];

      for (const weakness of weaknesses) {
        const category = weakness.category ?? QuestionCategory.GOVERNANCA;
        const frameworkRef =
          assessment.responses.find(
            (response) =>
              response.question?.category === category && response.question.frameworkRef,
          )?.question?.frameworkRef ?? null;
        const probability = RiskProbability.MEDIA;
        const impact =
          category === QuestionCategory.SEGURANCA ? RiskImpact.ALTO : RiskImpact.MEDIO;
        const calculated = this.calculateRiskScore(probability, impact);

        const risk = await tx.risk.create({
          data: {
            assessmentId: assessment.id,
            companyId: assessment.companyId,
            title: this.truncate(weakness.title?.trim() || `Risco em ${category}`, 150),
            description:
              weakness.summary?.trim() ||
              `Risco gerado automaticamente para a categoria ${category}.`,
            category,
            frameworkRef,
            probability,
            impact,
            riskScore: calculated.score,
            riskLevel: calculated.riskLevel,
            status: RiskStatus.IDENTIFICADO,
          },
        });

        items.push(risk);
      }

      return items;
    });

    return this.prisma.risk.findMany({
      where: { id: { in: created.map((item) => item.id) } },
      include: this.defaultInclude,
      orderBy: { id: 'asc' },
    });
  }

  async getRiskMatrix(companyId?: number): Promise<{
    companyId?: number;
    matrix: RiskMatrix;
    cells: RiskMatrixCell[];
  }> {
    if (companyId != null) {
      await this.ensureCompanyExists(companyId);
    }

    const rows = await this.prisma.risk.findMany({
      where: companyId != null ? { companyId } : undefined,
      select: {
        probability: true,
        impact: true,
      },
    });

    const matrix = this.emptyMatrix();

    for (const row of rows) {
      matrix[row.probability][row.impact] += 1;
    }

    const cells = (Object.values(RiskProbability) as RiskProbability[]).flatMap((probability) =>
      (Object.values(RiskImpact) as RiskImpact[]).map((impact) => ({
        probability,
        impact,
        count: matrix[probability][impact],
      })),
    );

    return {
      companyId,
      matrix,
      cells,
    };
  }

  async getStats(companyId?: number): Promise<RiskStats> {
    if (companyId != null) {
      await this.ensureCompanyExists(companyId);
    }

    const where: Prisma.RiskWhereInput = companyId != null ? { companyId } : {};

    const [total, levelGroups, statusGroups, categoryGroups] = await Promise.all([
      this.prisma.risk.count({ where }),
      this.prisma.risk.groupBy({
        by: ['riskLevel'],
        where,
        _count: { _all: true },
      }),
      this.prisma.risk.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.risk.groupBy({
        by: ['category'],
        where,
        _count: { _all: true },
      }),
    ]);

    const porNivel: RiskStats['porNivel'] = {
      CRITICO: 0,
      ALTO: 0,
      MEDIO: 0,
      BAIXO: 0,
    };
    const porStatus: RiskStats['porStatus'] = {
      IDENTIFICADO: 0,
      EM_TRATAMENTO: 0,
      MITIGADO: 0,
      ACEITO: 0,
      TRANSFERIDO: 0,
    };
    const porCategoria: RiskStats['porCategoria'] = {
      GOVERNANCA: 0,
      SEGURANCA: 0,
      PROCESSOS: 0,
      INFRAESTRUTURA: 0,
      CULTURA: 0,
    };

    for (const item of levelGroups) {
      if (item.riskLevel in porNivel) {
        porNivel[item.riskLevel as keyof typeof porNivel] = item._count._all;
      }
    }

    for (const item of statusGroups) {
      porStatus[item.status] = item._count._all;
    }

    for (const item of categoryGroups) {
      if (item.category in porCategoria) {
        porCategoria[item.category as QuestionCategory] = item._count._all;
      }
    }

    return {
      total,
      porNivel,
      porStatus,
      porCategoria,
    };
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

  private parseFutureReviewDate(reviewDate?: string): Date | null {
    if (!reviewDate) {
      return null;
    }

    const parsed = new Date(reviewDate);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('reviewDate must be a valid ISO date');
    }

    if (parsed.getTime() <= Date.now()) {
      throw new BadRequestException('reviewDate must be a future date');
    }

    return parsed;
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : value.slice(0, maxLength);
  }

  private emptyMatrix(): RiskMatrix {
    const matrix = {} as RiskMatrix;

    for (const probability of Object.values(RiskProbability) as RiskProbability[]) {
      matrix[probability] = {} as Record<RiskImpact, number>;
      for (const impact of Object.values(RiskImpact) as RiskImpact[]) {
        matrix[probability][impact] = 0;
      }
    }

    return matrix;
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
    const exists = await this.prisma.risk.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Risk with id '${id}' not found`);
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
  } satisfies Prisma.RiskInclude;
}
