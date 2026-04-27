import {
  QuestionCategory,
  RiskImpact,
  RiskProbability,
  RiskStatus,
} from '@prisma/client';
import { RisksService } from './risks.service';

describe('RisksService', () => {
  const createdAt = new Date('2026-04-01T00:00:00.000Z');
  const updatedAt = new Date('2026-04-02T00:00:00.000Z');

  const risk = {
    id: 1,
    assessmentId: 10,
    companyId: 5,
    title: 'Improvement area: Security',
    description: 'This is one of the lowest maturity categories (40).',
    category: QuestionCategory.SEGURANCA,
    frameworkRef: 'COBIT APO12',
    probability: RiskProbability.MEDIA,
    impact: RiskImpact.ALTO,
    riskScore: 12,
    riskLevel: 'ALTO',
    status: RiskStatus.IDENTIFICADO,
    treatment: null,
    responsibleId: null,
    reviewDate: null,
    closedAt: null,
    createdAt,
    updatedAt,
  };

  const riskWithRelations = {
    ...risk,
    assessment: {
      id: 10,
      status: 'SUBMITTED',
      companyId: 5,
    },
    company: {
      id: 5,
      name: 'ASCEND',
      segment: 'Tecnologia',
    },
    responsible: null,
  };

  const prisma = {
    risk: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    assessment: {
      findUnique: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: RisksService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma as never),
    );
    service = new RisksService(prisma as never);
  });

  it.each([
    [RiskProbability.MUITO_BAIXA, RiskImpact.MUITO_BAIXO, 1, 'BAIXO'],
    [RiskProbability.MUITO_BAIXA, RiskImpact.BAIXO, 2, 'BAIXO'],
    [RiskProbability.MUITO_BAIXA, RiskImpact.MEDIO, 3, 'BAIXO'],
    [RiskProbability.MUITO_BAIXA, RiskImpact.ALTO, 4, 'BAIXO'],
    [RiskProbability.MUITO_BAIXA, RiskImpact.MUITO_ALTO, 5, 'BAIXO'],
    [RiskProbability.BAIXA, RiskImpact.MUITO_BAIXO, 2, 'BAIXO'],
    [RiskProbability.BAIXA, RiskImpact.BAIXO, 4, 'BAIXO'],
    [RiskProbability.BAIXA, RiskImpact.MEDIO, 6, 'MEDIO'],
    [RiskProbability.BAIXA, RiskImpact.ALTO, 8, 'MEDIO'],
    [RiskProbability.BAIXA, RiskImpact.MUITO_ALTO, 10, 'MEDIO'],
    [RiskProbability.MEDIA, RiskImpact.MUITO_BAIXO, 3, 'BAIXO'],
    [RiskProbability.MEDIA, RiskImpact.BAIXO, 6, 'MEDIO'],
    [RiskProbability.MEDIA, RiskImpact.MEDIO, 9, 'MEDIO'],
    [RiskProbability.MEDIA, RiskImpact.ALTO, 12, 'ALTO'],
    [RiskProbability.MEDIA, RiskImpact.MUITO_ALTO, 15, 'ALTO'],
    [RiskProbability.ALTA, RiskImpact.MUITO_BAIXO, 4, 'BAIXO'],
    [RiskProbability.ALTA, RiskImpact.BAIXO, 8, 'MEDIO'],
    [RiskProbability.ALTA, RiskImpact.MEDIO, 12, 'ALTO'],
    [RiskProbability.ALTA, RiskImpact.ALTO, 16, 'ALTO'],
    [RiskProbability.ALTA, RiskImpact.MUITO_ALTO, 20, 'CRITICO'],
    [RiskProbability.MUITO_ALTA, RiskImpact.MUITO_BAIXO, 5, 'BAIXO'],
    [RiskProbability.MUITO_ALTA, RiskImpact.BAIXO, 10, 'MEDIO'],
    [RiskProbability.MUITO_ALTA, RiskImpact.MEDIO, 15, 'ALTO'],
    [RiskProbability.MUITO_ALTA, RiskImpact.ALTO, 20, 'CRITICO'],
    [RiskProbability.MUITO_ALTA, RiskImpact.MUITO_ALTO, 25, 'CRITICO'],
  ])('calculates score for %s x %s', (probability, impact, score, riskLevel) => {
    expect(service.calculateRiskScore(probability, impact)).toEqual({
      score,
      riskLevel,
    });
  });

  it('generates risks from assessment weaknesses', async () => {
    prisma.assessment.findUnique.mockResolvedValue({
      id: 10,
      companyId: 5,
      company: {
        id: 5,
        name: 'ASCEND',
        segment: 'Tecnologia',
      },
      report: {
        id: 9,
        assessmentId: 10,
        totalScore: 40,
        maturityLevel: 'ARTESANAL',
        categoryScores: {},
        strengths: [],
        weaknesses: [
          {
            category: QuestionCategory.SEGURANCA,
            title: 'Improvement area: Security',
            summary: 'This is one of the lowest maturity categories (40).',
          },
        ],
        recommendations: [],
        generatedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
      responses: [
        {
          id: 1,
          question: {
            id: 2,
            category: QuestionCategory.SEGURANCA,
            frameworkRef: 'COBIT APO12',
          },
        },
      ],
    });
    prisma.risk.create.mockResolvedValue(risk);
    prisma.risk.findMany.mockResolvedValue([riskWithRelations]);

    const result = await service.generateFromAssessment(10);

    expect(prisma.risk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assessmentId: 10,
          companyId: 5,
          category: QuestionCategory.SEGURANCA,
          probability: RiskProbability.MEDIA,
          impact: RiskImpact.ALTO,
          riskScore: 12,
          riskLevel: 'ALTO',
          frameworkRef: 'COBIT APO12',
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('returns aggregated stats', async () => {
    prisma.risk.count.mockResolvedValue(4);
    prisma.risk.groupBy
      .mockResolvedValueOnce([
        { riskLevel: 'CRITICO', _count: { _all: 1 } },
        { riskLevel: 'ALTO', _count: { _all: 2 } },
        { riskLevel: 'MEDIO', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { status: RiskStatus.IDENTIFICADO, _count: { _all: 2 } },
        { status: RiskStatus.MITIGADO, _count: { _all: 1 } },
        { status: RiskStatus.EM_TRATAMENTO, _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { category: QuestionCategory.SEGURANCA, _count: { _all: 3 } },
        { category: QuestionCategory.GOVERNANCA, _count: { _all: 1 } },
      ]);

    const result = await service.getStats();

    expect(result).toEqual({
      total: 4,
      porNivel: {
        CRITICO: 1,
        ALTO: 2,
        MEDIO: 1,
        BAIXO: 0,
      },
      porStatus: {
        IDENTIFICADO: 2,
        EM_TRATAMENTO: 1,
        MITIGADO: 1,
        ACEITO: 0,
        TRANSFERIDO: 0,
      },
      porCategoria: {
        GOVERNANCA: 1,
        SEGURANCA: 3,
        PROCESSOS: 0,
        INFRAESTRUTURA: 0,
        CULTURA: 0,
      },
    });
  });
});
