import { AssessmentStatus, QuestionCategory, Role } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const prisma = {
    company: {
      findFirst: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    assessment: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    report: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(prisma as never);
  });

  it('returns company evolution ordered by completion date', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 5,
      name: 'ASCEND',
      segment: 'Tecnologia',
      responsible: 'Ana',
      responsibleEmail: 'ana@example.com',
    });
    prisma.assessment.findMany.mockResolvedValue([
      {
        id: 1,
        completedAt: new Date('2026-01-10T00:00:00.000Z'),
        totalScore: 55,
        maturityLevel: 'EFICAZ',
        report: {
          totalScore: 55,
          maturityLevel: 'EFICAZ',
          categoryScores: {
            GOVERNANCA: 50,
            SEGURANCA: 60,
            PROCESSOS: 55,
            INFRAESTRUTURA: 58,
            CULTURA: 52,
          },
        },
      },
    ]);

    const result = await service.getCompanyEvolution(5, {
      sub: 'u1',
      email: 'cliente@example.com',
      role: Role.CLIENTE,
    });

    expect(result).toEqual([
      {
        assessmentId: 1,
        completedAt: new Date('2026-01-10T00:00:00.000Z'),
        totalScore: 55,
        maturityLevel: 'EFICAZ',
        categoryScores: {
          GOVERNANCA: 50,
          SEGURANCA: 60,
          PROCESSOS: 55,
          INFRAESTRUTURA: 58,
          CULTURA: 52,
        },
      },
    ]);
  });

  it('returns comparison sorted by total score desc', async () => {
    prisma.assessment.findFirst
      .mockResolvedValueOnce({
        id: 9,
        companyId: 1,
        completedAt: new Date('2026-03-10T00:00:00.000Z'),
        totalScore: 70,
        maturityLevel: 'EFICAZ',
        company: { name: 'A', segment: 'Tech' },
        report: {
          totalScore: 70,
          maturityLevel: 'EFICAZ',
          categoryScores: {
            GOVERNANCA: 1,
            SEGURANCA: 2,
            PROCESSOS: 3,
            INFRAESTRUTURA: 4,
            CULTURA: 5,
          },
        },
      })
      .mockResolvedValueOnce({
        id: 10,
        companyId: 2,
        completedAt: new Date('2026-03-11T00:00:00.000Z'),
        totalScore: 65,
        maturityLevel: 'EFICIENTE',
        company: { name: 'B', segment: 'Health' },
        report: {
          totalScore: 65,
          maturityLevel: 'EFICIENTE',
          categoryScores: {
            GOVERNANCA: 5,
            SEGURANCA: 4,
            PROCESSOS: 3,
            INFRAESTRUTURA: 2,
            CULTURA: 1,
          },
        },
      });

    const result = await service.getCompanyComparison([1, 2]);

    expect(result).toHaveLength(2);
    expect(result[0].companyId).toBe(1);
    expect(result[0].totalScore).toBe(70);
    expect(result[1].companyId).toBe(2);
  });

  it('returns benchmark using latest completed assessment per company', async () => {
    prisma.company.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.assessment.findFirst
      .mockResolvedValueOnce({
        id: 1,
        companyId: 1,
        status: AssessmentStatus.COMPLETED,
        totalScore: 60,
        maturityLevel: 'EFICIENTE',
        report: {
          totalScore: 60,
          maturityLevel: 'EFICIENTE',
          categoryScores: {
            GOVERNANCA: 50,
            SEGURANCA: 60,
            PROCESSOS: 70,
            INFRAESTRUTURA: 80,
            CULTURA: 90,
          },
        },
      })
      .mockResolvedValueOnce({
        id: 2,
        companyId: 2,
        status: AssessmentStatus.COMPLETED,
        totalScore: 80,
        maturityLevel: 'EFICAZ',
        report: {
          totalScore: 80,
          maturityLevel: 'EFICAZ',
          categoryScores: {
            GOVERNANCA: 70,
            SEGURANCA: 80,
            PROCESSOS: 90,
            INFRAESTRUTURA: 60,
            CULTURA: 50,
          },
        },
      });

    const result = await service.getBenchmarkBySegment('Tech');

    expect(result.segment).toBe('Tech');
    expect(result.avgTotalScore).toBe(70);
    expect(result.totalCompanies).toBe(2);
    expect(result.avgCategoryScores[QuestionCategory.SEGURANCA]).toBe(70);
  });

  it('returns platform stats aggregate', async () => {
    prisma.company.count.mockResolvedValue(3);
    prisma.assessment.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    prisma.user.count.mockResolvedValue(7);
    prisma.report.aggregate.mockResolvedValue({
      _avg: { totalScore: 60 },
    });
    prisma.report.groupBy.mockResolvedValue([
      { maturityLevel: 'EFICAZ', _count: { maturityLevel: 1 } },
      { maturityLevel: 'EFICIENTE', _count: { maturityLevel: 1 } },
    ]);
    prisma.assessment.findMany.mockResolvedValue([
      { createdAt: new Date('2026-01-15T00:00:00.000Z') },
      { createdAt: new Date('2026-02-15T00:00:00.000Z') },
    ]);
    prisma.company.findMany.mockResolvedValue([
      { id: 1, segment: 'Tech' },
      { id: 2, segment: 'Tech' },
      { id: 3, segment: 'Health' },
    ]);
    prisma.assessment.findFirst
      .mockResolvedValueOnce({
        totalScore: 82,
        report: { totalScore: 82 },
      })
      .mockResolvedValueOnce({
        totalScore: 38,
        report: { totalScore: 38 },
      })
      .mockResolvedValueOnce(null);

    const result = await service.getPlatformStats();

    expect(result.totalCompanies).toBe(3);
    expect(result.totalAssessments).toBe(5);
    expect(result.totalCompletedAssessments).toBe(2);
    expect(result.totalUsers).toBe(7);
    expect(result.avgTotalScore).toBe(60);
    expect(result.topSegments[0]).toEqual({ segment: 'Tech', count: 2, avgScore: 60 });
  });
});
