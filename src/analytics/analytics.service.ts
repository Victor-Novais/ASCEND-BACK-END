import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentStatus, Prisma, QuestionCategory, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { userCompanyScope } from '../auth/user-scope.helper';
import { PrismaService } from '../prisma/prisma.service';

type CategoryScores = Record<QuestionCategory, number>;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyEvolution(companyId: number, currentUser?: JwtPayload) {
    await this.ensureCompanyAccess(companyId, currentUser);

    const assessments = await this.prisma.assessment.findMany({
      where: { companyId, status: AssessmentStatus.COMPLETED },
      include: { report: true },
      orderBy: { completedAt: 'asc' },
    });

    return assessments.map((assessment) => ({
      assessmentId: assessment.id,
      completedAt: assessment.completedAt,
      totalScore: this.decimalToNumber(assessment.report?.totalScore ?? assessment.totalScore),
      maturityLevel: assessment.report?.maturityLevel ?? assessment.maturityLevel,
      categoryScores: this.normalizeCategoryScores(assessment.report?.categoryScores),
    }));
  }

  async getCompanyComparison(companyIds: number[]) {
    if (companyIds.length === 0) {
      return [];
    }

    const rows = await Promise.all(
      companyIds.map(async (companyId) => {
        const assessment = await this.prisma.assessment.findFirst({
          where: {
            companyId,
            status: AssessmentStatus.COMPLETED,
            report: { isNot: null },
          },
          include: {
            report: true,
            company: {
              select: {
                name: true,
                segment: true,
              },
            },
          },
          orderBy: { completedAt: 'desc' },
        });

        if (!assessment) {
          return null;
        }

        return {
          companyId,
          companyName: assessment.company.name,
          segment: assessment.company.segment,
          assessmentId: assessment.id,
          completedAt: assessment.completedAt,
          totalScore: this.decimalToNumber(assessment.report?.totalScore ?? assessment.totalScore),
          maturityLevel: assessment.report?.maturityLevel ?? assessment.maturityLevel,
          categoryScores: this.normalizeCategoryScores(assessment.report?.categoryScores),
        };
      }),
    );

    return rows
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  async getBenchmarkBySegment(segment: string) {
    const companies = await this.prisma.company.findMany({
      where: { segment },
      select: { id: true },
    });

    const latestAssessments = await Promise.all(
      companies.map(({ id }) =>
        this.prisma.assessment.findFirst({
          where: {
            companyId: id,
            status: AssessmentStatus.COMPLETED,
            report: { isNot: null },
          },
          include: { report: true },
          orderBy: { completedAt: 'desc' },
        }),
      ),
    );

    const completed = latestAssessments.filter(
      (assessment): assessment is NonNullable<typeof assessment> => assessment !== null,
    );

    const avgTotalScore =
      completed.length === 0
        ? 0
        : completed.reduce(
            (sum, assessment) =>
              sum + this.decimalToNumber(assessment.report?.totalScore ?? assessment.totalScore),
            0,
          ) / completed.length;

    const avgCategoryScores = this.averageCategoryScores(
      completed.map((assessment) => this.normalizeCategoryScores(assessment.report?.categoryScores)),
    );

    const maturityDistribution = completed.reduce<Record<string, number>>((acc, assessment) => {
      const level = assessment.report?.maturityLevel ?? assessment.maturityLevel ?? 'UNKNOWN';
      acc[level] = (acc[level] ?? 0) + 1;
      return acc;
    }, {});

    return {
      segment,
      avgTotalScore: this.round(avgTotalScore),
      avgCategoryScores,
      totalCompanies: companies.length,
      maturityDistribution,
    };
  }

  async getPlatformStats() {
    const now = new Date();
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      totalCompanies,
      totalAssessments,
      totalCompletedAssessments,
      totalUsers,
      avgReportScore,
      maturityDistributionRows,
      assessmentsLast12Months,
      companies,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.assessment.count(),
      this.prisma.assessment.count({ where: { status: AssessmentStatus.COMPLETED } }),
      this.prisma.user.count(),
      this.prisma.report.aggregate({ _avg: { totalScore: true } }),
      this.prisma.report.groupBy({
        by: ['maturityLevel'],
        _count: { maturityLevel: true },
      }),
      this.prisma.assessment.findMany({
        where: { createdAt: { gte: fromDate } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.company.findMany({
        select: {
          id: true,
          segment: true,
        },
      }),
    ]);

    const topSegmentRows = await Promise.all(
      [...new Set(companies.map((company) => company.segment))].map(async (segment) => {
        const companyIds = companies
          .filter((company) => company.segment === segment)
          .map((company) => company.id);

        const latestAssessments = await Promise.all(
          companyIds.map((companyId) =>
            this.prisma.assessment.findFirst({
              where: {
                companyId,
                status: AssessmentStatus.COMPLETED,
                report: { isNot: null },
              },
              include: { report: true },
              orderBy: { completedAt: 'desc' },
            }),
          ),
        );

        const completed = latestAssessments.filter(
          (assessment): assessment is NonNullable<typeof assessment> => assessment !== null,
        );

        const avgScore =
          completed.length === 0
            ? 0
            : completed.reduce(
                (sum, assessment) =>
                  sum +
                  this.decimalToNumber(assessment.report?.totalScore ?? assessment.totalScore),
                0,
              ) / completed.length;

        return {
          segment,
          count: companyIds.length,
          avgScore: this.round(avgScore),
        };
      }),
    );

    return {
      totalCompanies,
      totalAssessments,
      totalCompletedAssessments,
      totalUsers,
      avgTotalScore: this.round(this.decimalToNumber(avgReportScore._avg.totalScore)),
      maturityDistribution: maturityDistributionRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.maturityLevel] = row._count.maturityLevel;
        return acc;
      }, {}),
      assessmentsByMonth: this.buildAssessmentsByMonth(assessmentsLast12Months, fromDate),
      topSegments: topSegmentRows.sort((a, b) => b.count - a.count).slice(0, 3),
    };
  }

  async getCompanyRadar(companyId: number, currentUser?: JwtPayload) {
    const company = await this.ensureCompanyAccess(companyId, currentUser);
    const latestAssessment = await this.prisma.assessment.findFirst({
      where: {
        companyId,
        status: AssessmentStatus.COMPLETED,
        report: { isNot: null },
      },
      include: { report: true },
      orderBy: { completedAt: 'desc' },
    });

    if (!latestAssessment) {
      throw new NotFoundException('Nenhum assessment concluído encontrado para esta empresa');
    }

    const benchmark = await this.getBenchmarkBySegment(company.segment);

    return {
      companyName: company.name,
      categoryScores: this.normalizeCategoryScores(latestAssessment.report?.categoryScores),
      segmentAvgScores: benchmark.avgCategoryScores,
      categories: Object.values(QuestionCategory),
    };
  }

  async getCompanyReportExport(companyId: number, currentUser?: JwtPayload) {
    const company = await this.ensureCompanyAccess(companyId, currentUser);
    const assessments = await this.prisma.assessment.findMany({
      where: {
        companyId,
        status: AssessmentStatus.COMPLETED,
        report: { isNot: null },
      },
      include: { report: true },
      orderBy: { completedAt: 'asc' },
    });

    return {
      company: {
        id: company.id,
        name: company.name,
        segment: company.segment,
        responsible: company.responsible,
        responsibleEmail: company.responsibleEmail,
      },
      assessments: assessments.map((assessment) => ({
        assessmentId: assessment.id,
        completedAt: assessment.completedAt,
        totalScore: this.decimalToNumber(assessment.report?.totalScore ?? assessment.totalScore),
        maturityLevel: assessment.report?.maturityLevel ?? assessment.maturityLevel,
        categoryScores: this.normalizeCategoryScores(assessment.report?.categoryScores),
        strengths: assessment.report?.strengths ?? [],
        weaknesses: assessment.report?.weaknesses ?? [],
        recommendations: assessment.report?.recommendations ?? [],
        generatedAt: assessment.report?.generatedAt ?? null,
      })),
      exportedAt: new Date(),
    };
  }

  private async ensureCompanyAccess(companyId: number, currentUser?: JwtPayload) {
    const where =
      currentUser?.role === Role.CLIENTE
        ? { id: companyId, ...userCompanyScope(currentUser.sub) }
        : { id: companyId };

    const company = await this.prisma.company.findFirst({
      where,
      select: {
        id: true,
        name: true,
        segment: true,
        responsible: true,
        responsibleEmail: true,
      },
    });

    if (!company) {
      if (currentUser?.role === Role.CLIENTE) {
        throw new ForbiddenException('Acesso negado a esta empresa');
      }
      throw new NotFoundException(`Empresa ${companyId} não encontrada`);
    }

    return company;
  }

  private normalizeCategoryScores(value: Prisma.JsonValue | null | undefined): CategoryScores {
    const raw = (value ?? {}) as Record<string, unknown>;
    const result = {} as CategoryScores;

    for (const category of Object.values(QuestionCategory) as QuestionCategory[]) {
      result[category] = this.decimalToNumber(raw[category]);
    }

    return result;
  }

  private averageCategoryScores(scoresList: CategoryScores[]): CategoryScores {
    const result = {} as CategoryScores;

    for (const category of Object.values(QuestionCategory) as QuestionCategory[]) {
      const values = scoresList.map((scores) => scores[category] ?? 0);
      result[category] =
        values.length === 0
          ? 0
          : this.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    }

    return result;
  }

  private buildAssessmentsByMonth(
    rows: Array<{ createdAt: Date }>,
    fromDate: Date,
  ): Array<{ month: string; count: number }> {
    const months = new Map<string, number>();

    for (let i = 0; i < 12; i += 1) {
      const date = new Date(fromDate.getFullYear(), fromDate.getMonth() + i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.set(key, 0);
    }

    for (const row of rows) {
      const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (months.has(key)) {
        months.set(key, (months.get(key) ?? 0) + 1);
      }
    }

    return [...months.entries()].map(([month, count]) => ({ month, count }));
  }

  private decimalToNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const maybeDecimal = value as { toNumber?: () => number };
    if (typeof maybeDecimal.toNumber === 'function') {
      return maybeDecimal.toNumber();
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
