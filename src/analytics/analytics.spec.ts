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
      size: null,
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

  it('returns comparison using latest completed assessment per company', async () => {
    prisma.assessment.findMany.mockResolvedValue([
      {
        id: 9,
        companyId: 1,
        completedAt: new Date('2026-03-10T00:00:00.000Z'),
        totalScore: 70,
        maturityLevel: 'EFICAZ',
        company: { name: 'A', segment: 'Tech' },
        report: { categoryScores: { GOVERNANCA: 1, SEGURANCA: 2, PROCESSOS: 3, INFRAESTRUTURA: 4, CULTURA: 5 } },
      },
      {
        id: 10,
        companyId: 2,
        completedAt: new Date('2026-03-11T00:00:00.000Z'),
        totalScore: 65,
        maturityLevel: 'EFICIENTE',
        company: { name: 'B', segment: 'Health' },
        report: { categoryScores: { GOVERNANCA: 5, SEGURANCA: 4, PROCESSOS: 3, INFRAESTRUTURA: 2, CULTURA: 1 } },
      },
    ]);

    const result = await service.getCompanyComparison([1, 2]);

    expect(result).toHaveLength(2);
    expect(result[0].companyId).toBe(1);
    expect(result[1].companyId).toBe(2);
  });

  it('returns platform stats aggregate', async () => {
    prisma.company.count.mockResolvedValue(3);
    prisma.assessment.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);
    prisma.user.count.mockResolvedValue(7);
    prisma.assessment.findMany
      .mockResolvedValueOnce([
        {
          id: 1,
          companyId: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: new Date('2026-01-15T00:00:00.000Z'),
          totalScore: 82,
          company: { name: 'A', segment: 'Tech' },
        },
        {
          id: 2,
          companyId: 2,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          completedAt: new Date('2026-02-15T00:00:00.000Z'),
          totalScore: 38,
          company: { name: 'B', segment: 'Tech' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 100,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          company: { name: 'A' },
        },
      ]);
    prisma.company.findMany
      .mockResolvedValueOnce([
        { id: 1, name: 'A', segment: 'Tech', createdAt: new Date('2026-03-01T00:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { id: 1, name: 'A', createdAt: new Date('2026-04-02T00:00:00.000Z') },
      ]);

    const result = await service.getPlatformStats();

    expect(result.totalCompanies).toBe(3);
    expect(result.totalAssessments).toBe(5);
    expect(result.totalCompleted).toBe(2);
    expect(result.totalUsers).toBe(7);
    expect(result.topSegments[0]).toEqual({ segment: 'Tech', count: 2, avgScore: 60 });
  });
});
