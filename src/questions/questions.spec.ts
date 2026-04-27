import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FrameworkType, QuestionCategory, ResponseType, Role } from '@prisma/client';
import { QuestionsService } from './questions.service';

describe('QuestionsService', () => {
  const createdBy = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Admin',
    email: 'admin@example.com',
    role: Role.ADMIN,
  };

  const baseQuestion = {
    id: 1,
    version: 1,
    text: 'A questao possui politica formal?',
    category: QuestionCategory.GOVERNANCA,
    weight: 1.5,
    responseType: ResponseType.YES_NO,
    frameworkType: FrameworkType.PROPRIO,
    frameworkRef: null,
    frameworkNote: null,
    evidenceRequired: true,
    hint: 'Anexe evidencias.',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdById: createdBy.id,
  };

  const questionWithHistory = {
    ...baseQuestion,
    createdBy,
    versions: [],
  };

  const prisma = {
    question: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    questionVersion: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: QuestionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma as never));
    service = new QuestionsService(prisma as never);
  });

  it('creates questions with PROPRIO as default framework', async () => {
    prisma.question.create.mockResolvedValue(baseQuestion);
    prisma.questionVersion.create.mockResolvedValue({});
    prisma.question.findUnique.mockResolvedValue(questionWithHistory);

    const result = await service.create({
      text: baseQuestion.text,
      category: baseQuestion.category,
      weight: baseQuestion.weight,
      responseType: baseQuestion.responseType,
      evidenceRequired: baseQuestion.evidenceRequired,
      hint: baseQuestion.hint,
      createdById: createdBy.id,
    });

    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          frameworkType: FrameworkType.PROPRIO,
          frameworkRef: null,
          frameworkNote: null,
        }),
      }),
    );
    expect(result.frameworkType).toBe(FrameworkType.PROPRIO);
  });

  it('creates questions with framework mapping when provided', async () => {
    prisma.question.create.mockResolvedValue({
      ...baseQuestion,
      frameworkType: FrameworkType.COBIT,
      frameworkRef: 'APO12.01',
      frameworkNote: 'Mapeada para controle de riscos.',
    });
    prisma.questionVersion.create.mockResolvedValue({});
    prisma.question.findUnique.mockResolvedValue({
      ...questionWithHistory,
      frameworkType: FrameworkType.COBIT,
      frameworkRef: 'APO12.01',
      frameworkNote: 'Mapeada para controle de riscos.',
    });

    await service.create({
      text: baseQuestion.text,
      category: baseQuestion.category,
      weight: baseQuestion.weight,
      responseType: baseQuestion.responseType,
      evidenceRequired: baseQuestion.evidenceRequired,
      hint: baseQuestion.hint,
      createdById: createdBy.id,
      frameworkType: FrameworkType.COBIT,
      frameworkRef: 'APO12.01',
      frameworkNote: 'Mapeada para controle de riscos.',
    });

    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          frameworkType: FrameworkType.COBIT,
          frameworkRef: 'APO12.01',
          frameworkNote: 'Mapeada para controle de riscos.',
        }),
      }),
    );
  });

  it('rejects frameworkType without frameworkRef on create', async () => {
    await expect(
      service.create({
        text: baseQuestion.text,
        category: baseQuestion.category,
        weight: baseQuestion.weight,
        responseType: baseQuestion.responseType,
        evidenceRequired: baseQuestion.evidenceRequired,
        createdById: createdBy.id,
        frameworkType: FrameworkType.ITIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a new version preserving framework data when omitted', async () => {
    prisma.question.findUnique
      .mockResolvedValueOnce({
        ...baseQuestion,
        frameworkType: FrameworkType.ISO_27000,
        frameworkRef: 'A.9.1.1',
        frameworkNote: 'Controle de acesso.',
      })
      .mockResolvedValueOnce({
        ...questionWithHistory,
        version: 2,
        frameworkType: FrameworkType.ISO_27000,
        frameworkRef: 'A.9.1.1',
        frameworkNote: 'Controle de acesso.',
      });
    prisma.questionVersion.create.mockResolvedValue({});
    prisma.question.update.mockResolvedValue({});

    const result = await service.createNewVersion(1, {
      changedById: createdBy.id,
      text: 'Texto atualizado',
    });

    expect(prisma.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          frameworkType: FrameworkType.ISO_27000,
          frameworkRef: 'A.9.1.1',
          frameworkNote: 'Controle de acesso.',
        }),
      }),
    );
    expect(result.version).toBe(2);
  });

  it('rejects frameworkType without frameworkRef on update', async () => {
    prisma.question.findUnique.mockResolvedValue(baseQuestion);

    await expect(
      service.createNewVersion(1, {
        changedById: createdBy.id,
        frameworkType: FrameworkType.COBIT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters active questions by framework', async () => {
    prisma.question.findMany.mockResolvedValue([
      {
        ...questionWithHistory,
        frameworkType: FrameworkType.COBIT,
        frameworkRef: 'APO12.01',
      },
    ]);

    const result = await service.findByFramework(FrameworkType.COBIT);

    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          frameworkType: FrameworkType.COBIT,
        },
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('returns framework coverage counts for dashboard usage', async () => {
    prisma.question.groupBy.mockResolvedValue([
      { frameworkType: FrameworkType.COBIT, _count: { _all: 2 } },
      { frameworkType: FrameworkType.ITIL, _count: { _all: 1 } },
      { frameworkType: null, _count: { _all: 3 } },
    ]);

    const result = await service.getFrameworkCoverage();

    expect(result).toEqual({
      COBIT: 2,
      ITIL: 1,
      ISO_27000: 0,
      PROPRIO: 3,
      total: 6,
    });
  });

  it('throws when question is not found', async () => {
    prisma.question.findUnique.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
