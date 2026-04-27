import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentStatus, Prisma, QuestionCategory, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { isAdmin, userCompanyScope } from '../auth/user-scope.helper';
import { PrismaService } from '../prisma/prisma.service';

type CategoryScores = Record<QuestionCategory, number>;

type CompanyAnalyticsAssessment = {
  assessmentId: number;
  completedAt: Date;
  totalScore: number;
  maturityLevel: string | null;
  categoryScores: CategoryScores;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyEvolution(
    companyId: number,
    currentUser?: JwtPayload,
  ): Promise<CompanyAnalyticsAssessment[]> {
    await this.ensureCompanyAccess(companyId, currentUser);

    const rows = await this.prisma.assessment.findMany({
      where: {
        companyId,
        status: AssessmentStatus.COMPLETED,
        completedAt: { not: null },
        report: { isNot: null },
      },
      select: {
        id: true,
        completedAt: true,
        totalScore: true,
        maturityLevel: true,
        report: {
          select: {
            categoryScores: true,
          },
        },
      },
      orderBy: { completedAt: 'asc' },
    });

    return rows.map((row) => ({
      assessmentId: row.id,
      completedAt: row.completedAt!,
      totalScore: this.decimalToNumber(row.totalScore),
      maturityLevel: row.maturityLevel,
      categoryScores: this.normalizeCategoryScores(row.report?.categoryScores),
    }));
  }

  async getCompanyComparison(companyIds: number[]) {
    if (companyIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.assessment.findMany({
      where: {
        companyId: { in: companyIds },
        status: AssessmentStatus.COMPLETED,
        completedAt: { not: null },
        report: { isNot: null },
      },
      select: {
        id: true,
        companyId: true,
        completedAt: true,
        totalScore: true,
        maturityLevel: true,
        company: {
          select: {
            name: true,
            segment: true,
          },
        },
        report: {
          select: {
            categoryScores: true,
          },
        },
      },
      orderBy: [{ companyId: 'asc' }, { completedAt: 'desc' }],
    });

    const latestByCompany = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByCompany.has(row.companyId)) {
        latestByCompany.set(row.companyId, row);
      }
    }

    return companyIds
      .map((companyId) => latestByCompany.get(companyId))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        companyId: row.companyId,
        companyName: row.company.name,
        segment: row.company.segment,
        totalScore: this.decimalToNumber(row.totalScore),
        maturityLevel: row.maturityLevel,
        categoryScores: this.normalizeCategoryScores(row.report?.categoryScores),
        assessmentDate: row.completedAt,
      }));
  }

  async getBenchmarkBySegment(segment: string) {
    const rows = await this.prisma.assessment.findMany({
      where: {
        status: AssessmentStatus.COMPLETED,
        completedAt: { not: null },
        report: { isNot: null },
        company: { segment },
      },
      select: {
        companyId: true,
        totalScore: true,
        maturityLevel: true,
        report: {
          select: {
            categoryScores: true,
          },
        },
      },
    });

    const totalCompanies = new Set(rows.map((row) => row.companyId)).size;
    const avgTotalScore =
      rows.length === 0
        ? 0
        : rows.reduce((sum, row) => sum + this.decimalToNumber(row.totalScore), 0) / rows.length;
    const avgCategoryScores = this.averageCategoryScores(
      rows.map((row) => this.normalizeCategoryScores(row.report?.categoryScores)),
    );
    const maturityDistribution = rows.reduce<Record<string, number>>((acc, row) => {
      const key = row.maturityLevel ?? 'UNKNOWN';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      segment,
      avgTotalScore: this.round(avgTotalScore),
      avgCategoryScores,
      totalCompanies,
      maturityDistribution,
    };
  }

  async getPlatformStats() {
    const [
      totalCompanies,
      totalAssessments,
      totalCompleted,
      totalUsers,
      completedAssessments,
      companies,
      recentAssessments,
      recentCompanies,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.assessment.count(),
      this.prisma.assessment.count({ where: { status: AssessmentStatus.COMPLETED } }),
      this.prisma.user.count(),
      this.prisma.assessment.findMany({
        where: {
          status: AssessmentStatus.COMPLETED,
          completedAt: { not: null },
          report: { isNot: null },
        },
        select: {
          id: true,
          companyId: true,
          createdAt: true,
          completedAt: true,
          totalScore: true,
          company: {
            select: {
              name: true,
              segment: true,
            },
          },
        },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.company.findMany({
        select: {
          id: true,
          name: true,
          segment: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.assessment.findMany({
        select: {
          id: true,
          createdAt: true,
          company: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.company.findMany({
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const avgMaturityScore =
      completedAssessments.length === 0
        ? 0
        : completedAssessments.reduce(
            (sum, row) => sum + this.decimalToNumber(row.totalScore),
            0,
          ) / completedAssessments.length;

    const maturityDistribution = {
      INICIAL: 0,
      BASICO: 0,
      EFICIENTE: 0,
      EFICAZ: 0,
      OTIMIZADO: 0,
    };
    for (const row of completedAssessments) {
      maturityDistribution[this.toPlatformMaturityLevel(this.decimalToNumber(row.totalScore))] += 1;
    }

    const assessmentsByMonth = this.buildAssessmentsByMonth(completedAssessments);
    const topSegments = this.buildTopSegments(completedAssessments);
    const recentActivity = [
      ...recentAssessments.map((row) => ({
        type: 'assessment' as const,
        description: `Assessment #${row.id} created for ${row.company.name}`,
        createdAt: row.createdAt,
      })),
      ...recentCompanies.map((row) => ({
        type: 'company' as const,
        description: `Company ${row.name} created`,
        createdAt: row.createdAt,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return {
      totalCompanies,
      totalAssessments,
      totalCompleted,
      totalUsers,
      avgMaturityScore: this.round(avgMaturityScore),
      maturityDistribution,
      assessmentsByMonth,
      topSegments,
      recentActivity,
    };
  }

  async getCompanyRadar(companyId: number, currentUser?: JwtPayload) {
    const company = await this.ensureCompanyAccess(companyId, currentUser);
    const latestAssessment = await this.findLatestCompletedAssessment(companyId);

    if (!latestAssessment) {
      throw new NotFoundException('No completed assessment found for this company');
    }

    const benchmark = await this.getBenchmarkBySegment(company.segment);

    return {
      company: {
        name: company.name,
        categoryScores: this.normalizeCategoryScores(
          latestAssessment.report?.categoryScores,
        ),
      },
      segmentAvg: {
        categoryScores: benchmark.avgCategoryScores,
      },
      categories: Object.values(QuestionCategory),
    };
  }

  async getCompanyReportExport(companyId: number, currentUser?: JwtPayload) {
    const company = await this.ensureCompanyAccess(companyId, currentUser);
    const evolution = await this.getCompanyEvolution(companyId, currentUser);
    const latestAssessment = await this.findLatestCompletedAssessment(companyId);
    const benchmark = await this.getBenchmarkBySegment(company.segment);

    return {
      company: {
        id: company.id,
        name: company.name,
        segment: company.segment,
        size: company.size,
        responsible: company.responsible,
        responsibleEmail: company.responsibleEmail,
      },
      latestAssessment: latestAssessment
        ? {
            assessmentId: latestAssessment.id,
            completedAt: latestAssessment.completedAt,
            totalScore: this.decimalToNumber(latestAssessment.totalScore),
            maturityLevel: latestAssessment.maturityLevel,
            categoryScores: this.normalizeCategoryScores(
              latestAssessment.report?.categoryScores,
            ),
          }
        : null,
      evolution,
      radar: latestAssessment
        ? {
            company: {
              name: company.name,
              categoryScores: this.normalizeCategoryScores(
                latestAssessment.report?.categoryScores,
              ),
            },
            segmentAvg: {
              categoryScores: benchmark.avgCategoryScores,
            },
            categories: Object.values(QuestionCategory),
          }
        : null,
      benchmark,
      generatedAt: new Date(),
    };
  }

  private async ensureCompanyAccess(companyId: number, currentUser?: JwtPayload) {
    const company = await this.prisma.company.findFirst({
      where: !currentUser || isAdmin({ id: currentUser.sub, role: currentUser.role })
        ? { id: companyId }
        : {
            id: companyId,
            ...userCompanyScope(currentUser.sub),
          },
      select: {
        id: true,
        name: true,
        segment: true,
        size: true,
        responsible: true,
        responsibleEmail: true,
      },
    });

    if (!company) {
      if (currentUser && currentUser.role === Role.CLIENTE) {
        throw new ForbiddenException('You do not have access to this company');
      }
      throw new NotFoundException(`Company with id '${companyId}' not found`);
    }

    return company;
  }

  private async findLatestCompletedAssessment(companyId: number) {
    return this.prisma.assessment.findFirst({
      where: {
        companyId,
        status: AssessmentStatus.COMPLETED,
        completedAt: { not: null },
        report: { isNot: null },
      },
      select: {
        id: true,
        completedAt: true,
        totalScore: true,
        maturityLevel: true,
        report: {
          select: {
            categoryScores: true,
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });
  }

  private normalizeCategoryScores(value: unknown): CategoryScores {
    const raw = (value ?? {}) as Record<string, unknown>;
    const categories = Object.values(QuestionCategory) as QuestionCategory[];
    const result = {} as CategoryScores;

    for (const category of categories) {
      result[category] = this.decimalToNumber(raw[category]);
    }

    return result;
  }

  private averageCategoryScores(scoresList: CategoryScores[]): CategoryScores {
    const categories = Object.values(QuestionCategory) as QuestionCategory[];
    const result = {} as CategoryScores;

    for (const category of categories) {
      const values = scoresList.map((scores) => scores[category] ?? 0);
      result[category] =
        values.length === 0
          ? 0
          : this.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    }

    return result;
  }

  private buildAssessmentsByMonth(
    rows: Array<{
      completedAt: Date | null;
    }>,
  ) {
    const months = new Map<string, number>();
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.set(key, 0);
    }

    for (const row of rows) {
      if (!row.completedAt) continue;
      const key = `${row.completedAt.getFullYear()}-${String(
        row.completedAt.getMonth() + 1,
      ).padStart(2, '0')}`;
      if (months.has(key)) {
        months.set(key, (months.get(key) ?? 0) + 1);
      }
    }

    return [...months.entries()].map(([month, count]) => ({ month, count }));
  }

  private buildTopSegments(
    rows: Array<{
      company: { segment: string };
      totalScore: Prisma.Decimal | number | null;
    }>,
  ) {
    const grouped = new Map<string, { count: number; sum: number }>();

    for (const row of rows) {
      const segment = row.company.segment;
      const current = grouped.get(segment) ?? { count: 0, sum: 0 };
      current.count += 1;
      current.sum += this.decimalToNumber(row.totalScore);
      grouped.set(segment, current);
    }

    return [...grouped.entries()]
      .map(([segment, value]) => ({
        segment,
        count: value.count,
        avgScore: this.round(value.sum / value.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private toPlatformMaturityLevel(
    score: number,
  ): 'INICIAL' | 'BASICO' | 'EFICIENTE' | 'EFICAZ' | 'OTIMIZADO' {
    if (score <= 20) return 'INICIAL';
    if (score <= 40) return 'BASICO';
    if (score <= 60) return 'EFICIENTE';
    if (score <= 80) return 'EFICAZ';
    return 'OTIMIZADO';
  }

  private decimalToNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const maybeDecimal = value as { toNumber?: () => number };
    if (typeof maybeDecimal?.toNumber === 'function') {
      const parsed = maybeDecimal.toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(value as any);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
