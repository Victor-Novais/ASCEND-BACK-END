import { ActionPlanPriority, ActionPlanStatus, QuestionCategory, Role } from '@prisma/client';
import { ActionPlansService } from './action-plans.service';

describe('ActionPlansService', () => {
  const createdAt = new Date('2026-04-01T00:00:00.000Z');
  const updatedAt = new Date('2026-04-02T00:00:00.000Z');

  const actionPlan = {
    id: 1,
    assessmentId: 10,
    companyId: 5,
    title: 'Plano de seguranca',
    description: 'Implementar melhorias de seguranca prioritarias.',
    category: QuestionCategory.SEGURANCA,
    frameworkRef: 'ISO 27002 A.9',
    priority: ActionPlanPriority.MEDIA,
    status: ActionPlanStatus.PENDENTE,
    responsibleId: null,
    dueDate: null,
    completedAt: null,
    observations: null,
    createdAt,
    updatedAt,
  };

  const actionPlanWithRelations = {
    ...actionPlan,
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
    actionPlan: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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

  let service: ActionPlansService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma as never),
    );
    service = new ActionPlansService(prisma as never);
  });

  it('creates an action plan', async () => {
    prisma.assessment.findUnique.mockResolvedValue({ id: 10, companyId: 5 });
    prisma.company.findUnique.mockResolvedValue({ id: 5 });
    prisma.actionPlan.create.mockResolvedValue(actionPlan);
    prisma.actionPlan.findUnique.mockResolvedValue(actionPlanWithRelations);

    const dueDate = new Date(Date.now() + 86400000).toISOString();

    const result = await service.create({
      assessmentId: 10,
      companyId: 5,
      title: 'Plano de seguranca',
      description: 'Implementar melhorias de seguranca prioritarias.',
      category: QuestionCategory.SEGURANCA,
      frameworkRef: 'ISO 27002 A.9',
      dueDate,
    });

    expect(prisma.actionPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: ActionPlanPriority.MEDIA,
          status: ActionPlanStatus.PENDENTE,
        }),
      }),
    );
    expect(result.id).toBe(1);
  });

  it('filters action plans in findAll', async () => {
    prisma.actionPlan.findMany.mockResolvedValue([actionPlanWithRelations]);

    const result = await service.findAll({
      companyId: 5,
      status: ActionPlanStatus.PENDENTE,
      priority: ActionPlanPriority.MEDIA,
    });

    expect(prisma.actionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 5,
          status: ActionPlanStatus.PENDENTE,
          priority: ActionPlanPriority.MEDIA,
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('sets completedAt when status changes to CONCLUIDO', async () => {
    prisma.actionPlan.findUnique
      .mockResolvedValueOnce(actionPlan)
      .mockResolvedValueOnce({
        ...actionPlanWithRelations,
        status: ActionPlanStatus.CONCLUIDO,
        completedAt: new Date('2026-04-03T00:00:00.000Z'),
      });
    prisma.assessment.findUnique.mockResolvedValue({ id: 10, companyId: 5 });
    prisma.company.findUnique.mockResolvedValue({ id: 5 });
    prisma.actionPlan.update.mockResolvedValue({});

    const result = await service.update(1, {
      status: ActionPlanStatus.CONCLUIDO,
    });

    expect(prisma.actionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ActionPlanStatus.CONCLUIDO,
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe(ActionPlanStatus.CONCLUIDO);
  });

  it('generates action plans from assessment weaknesses', async () => {
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
    prisma.actionPlan.create.mockResolvedValue(actionPlan);
    prisma.actionPlan.findMany.mockResolvedValue([actionPlanWithRelations]);

    const result = await service.generateFromAssessment(10);

    expect(prisma.actionPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assessmentId: 10,
          companyId: 5,
          category: QuestionCategory.SEGURANCA,
          priority: ActionPlanPriority.ALTA,
          frameworkRef: 'COBIT APO12',
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });
});
