import {
  AssessmentAssignmentStatus,
  AssessmentStatus,
  Prisma,
  PrismaClient,
  QuestionCategory,
  ResponseType,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@1234';
const DEMO_COMPANY_CODE = 'DEMO-HAROLDO-TECH';
const DEMO_COMPANY_NAME = 'DEMO - HAROLDO TECH';
const DEMO_SEGMENT = 'Tecnologia';

type DemoQuestionSeed = {
  order: number;
  text: string;
  category: QuestionCategory;
  responseType: ResponseType;
  weight: number;
};

const DEMO_QUESTIONS: DemoQuestionSeed[] = [
  {
    order: 1,
    text: 'DEMO | Existe politica formal de seguranca da informacao?',
    category: QuestionCategory.SEGURANCA,
    responseType: ResponseType.YES_NO,
    weight: 3,
  },
  {
    order: 2,
    text: 'DEMO | A empresa usa MFA para sistemas criticos?',
    category: QuestionCategory.SEGURANCA,
    responseType: ResponseType.YES_NO,
    weight: 2,
  },
  {
    order: 3,
    text: 'DEMO | Nivel de monitoramento de vulnerabilidades (0 a 10).',
    category: QuestionCategory.SEGURANCA,
    responseType: ResponseType.SCALE,
    weight: 3,
  },
  {
    order: 4,
    text: 'DEMO | A infraestrutura possui backups testados regularmente?',
    category: QuestionCategory.INFRAESTRUTURA,
    responseType: ResponseType.YES_NO,
    weight: 3,
  },
  {
    order: 5,
    text: 'DEMO | Nivel de observabilidade de ambientes (0 a 10).',
    category: QuestionCategory.INFRAESTRUTURA,
    responseType: ResponseType.SCALE,
    weight: 2,
  },
  {
    order: 6,
    text: 'DEMO | Grau de automacao de deploy e provisionamento (0 a 10).',
    category: QuestionCategory.INFRAESTRUTURA,
    responseType: ResponseType.SCALE,
    weight: 2,
  },
  {
    order: 7,
    text: 'DEMO | Existe comite de governanca de TI ativo?',
    category: QuestionCategory.GOVERNANCA,
    responseType: ResponseType.YES_NO,
    weight: 2,
  },
  {
    order: 8,
    text: 'DEMO | A TI acompanha KPIs estrategicos do negocio?',
    category: QuestionCategory.GOVERNANCA,
    responseType: ResponseType.YES_NO,
    weight: 2,
  },
  {
    order: 9,
    text: 'DEMO | Nivel de maturidade de gestao de riscos (0 a 10).',
    category: QuestionCategory.GOVERNANCA,
    responseType: ResponseType.SCALE,
    weight: 3,
  },
  {
    order: 10,
    text: 'DEMO | Colaboradores recebem treinamento continuo em TI?',
    category: QuestionCategory.CULTURA,
    responseType: ResponseType.YES_NO,
    weight: 2,
  },
  {
    order: 11,
    text: 'DEMO | Nivel de engajamento do time com melhoria continua (0 a 10).',
    category: QuestionCategory.CULTURA,
    responseType: ResponseType.SCALE,
    weight: 1,
  },
  {
    order: 12,
    text: 'DEMO | Nivel de colaboracao entre TI e negocio (0 a 10).',
    category: QuestionCategory.CULTURA,
    responseType: ResponseType.SCALE,
    weight: 1,
  },
];

const DEMO_RESPONSES_BY_ORDER: Record<number, string> = {
  1: 'YES',
  2: 'NO',
  3: '7',
  4: 'YES',
  5: '6',
  6: '8',
  7: 'YES',
  8: 'NO',
  9: '5',
  10: 'YES',
  11: '6',
  12: '4',
};

function normalizeResponse(responseType: ResponseType, responseValue: string): number {
  const value = responseValue.trim();

  if (responseType === ResponseType.YES_NO) {
    const upper = value.toUpperCase();
    if (upper === 'YES') return 100;
    if (upper === 'NO') return 0;
    throw new Error(`Invalid YES_NO response: "${responseValue}"`);
  }

  if (responseType === ResponseType.SCALE) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
      throw new Error(`Invalid SCALE response: "${responseValue}"`);
    }
    return parsed * 10;
  }

  throw new Error(`Unsupported response type: ${String(responseType)}`);
}

function toOptionWeight(responseType: ResponseType, responseValue: string): number {
  if (responseType === ResponseType.YES_NO) {
    return responseValue.toUpperCase() === 'YES' ? 1 : 0;
  }
  return Number(responseValue) / 2;
}

async function ensureUser(params: {
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { email: params.email },
    create: {
      id: randomUUID(),
      name: params.name,
      email: params.email,
      role: params.role,
      passwordHash: params.passwordHash,
    },
    update: {
      name: params.name,
      role: params.role,
      passwordHash: params.passwordHash,
    },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await ensureUser({
    name: 'Demo Admin',
    email: 'admin@demo.com',
    role: Role.ADMIN,
    passwordHash,
  });

  const client = await ensureUser({
    name: 'Haroldo',
    email: 'haroldo@gmail.com',
    role: Role.CLIENTE,
    passwordHash,
  });

  const collaborators = await Promise.all(
    [
      { name: 'Colaborador Demo', email: 'colaborador.demo@gmail.com' },
      { name: 'Colaborador 1', email: 'colaborador1@gmail.com' },
      { name: 'Colaborador 2', email: 'colaborador2@gmail.com' },
      { name: 'Colaborador 3', email: 'colaborador3@gmail.com' },
      { name: 'Colaborador 4', email: 'colaborador4@gmail.com' },
    ].map((person) =>
      ensureUser({
        name: person.name,
        email: person.email,
        role: Role.COLLABORATOR,
        passwordHash,
      }),
    ),
  );

  const company = await prisma.company.upsert({
    where: { companyCode: DEMO_COMPANY_CODE },
    create: {
      companyCode: DEMO_COMPANY_CODE,
      name: DEMO_COMPANY_NAME,
      segment: DEMO_SEGMENT,
      responsible: 'Haroldo',
      responsibleEmail: 'haroldo@gmail.com',
      responsiblePhone: null,
      createdById: client.id,
    },
    update: {
      name: DEMO_COMPANY_NAME,
      segment: DEMO_SEGMENT,
      responsible: 'Haroldo',
      responsibleEmail: 'haroldo@gmail.com',
      createdById: client.id,
    },
  });

  await prisma.userCompanyAssignment.upsert({
    where: {
      userId_companyId: {
        userId: client.id,
        companyId: company.id,
      },
    },
    create: {
      userId: client.id,
      companyId: company.id,
    },
    update: {},
  });

  for (const collaborator of collaborators) {
    await prisma.userCompanyAssignment.upsert({
      where: {
        userId_companyId: {
          userId: collaborator.id,
          companyId: company.id,
        },
      },
      create: {
        userId: collaborator.id,
        companyId: company.id,
      },
      update: {},
    });
  }

  let assessment = await prisma.assessment.findFirst({
    where: {
      companyId: company.id,
      assessorId: client.id,
      questions: {
        some: {
          text: {
            startsWith: 'DEMO |',
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        companyId: company.id,
        assessorId: client.id,
        status: AssessmentStatus.NOT_STARTED,
      },
    });
  }

  for (const collaborator of collaborators) {
    await prisma.assessmentAssignment.upsert({
      where: {
        assessmentId_userId: {
          assessmentId: assessment.id,
          userId: collaborator.id,
        },
      },
      create: {
        assessmentId: assessment.id,
        userId: collaborator.id,
      },
      update: {},
    });
  }

  const questionsByOrder = new Map<
    number,
    {
      id: number;
      category: QuestionCategory | null;
      responseType: ResponseType;
      weight: Prisma.Decimal;
    }
  >();

  for (const seed of DEMO_QUESTIONS) {
    let question = await prisma.assessmentQuestion.findFirst({
      where: {
        assessmentId: assessment.id,
        text: seed.text,
      },
    });

    if (!question) {
      question = await prisma.assessmentQuestion.create({
        data: {
          assessmentId: assessment.id,
          text: seed.text,
          category: seed.category,
          order: seed.order,
          responseType: seed.responseType,
          weight: new Prisma.Decimal(seed.weight),
        },
      });
    } else {
      question = await prisma.assessmentQuestion.update({
        where: { id: question.id },
        data: {
          category: seed.category,
          order: seed.order,
          responseType: seed.responseType,
          weight: new Prisma.Decimal(seed.weight),
        },
      });
    }

    questionsByOrder.set(seed.order, question);

    if (seed.responseType === ResponseType.YES_NO) {
      const yesOption = await prisma.assessmentQuestionOption.findFirst({
        where: {
          assessmentQuestionId: question.id,
          text: 'YES',
        },
      });
      if (!yesOption) {
        await prisma.assessmentQuestionOption.create({
          data: {
            assessmentQuestionId: question.id,
            text: 'YES',
            weight: 1,
            order: 1,
          },
        });
      }

      const noOption = await prisma.assessmentQuestionOption.findFirst({
        where: {
          assessmentQuestionId: question.id,
          text: 'NO',
        },
      });
      if (!noOption) {
        await prisma.assessmentQuestionOption.create({
          data: {
            assessmentQuestionId: question.id,
            text: 'NO',
            weight: 0,
            order: 0,
          },
        });
      }
    } else {
      for (let value = 0; value <= 10; value += 1) {
        const label = String(value);
        const existing = await prisma.assessmentQuestionOption.findFirst({
          where: {
            assessmentQuestionId: question.id,
            text: label,
          },
        });
        if (!existing) {
          await prisma.assessmentQuestionOption.create({
            data: {
              assessmentQuestionId: question.id,
              text: label,
              weight: value / 2,
              order: value,
            },
          });
        }
      }
    }
  }

  const demoCollaborator = collaborators.find(
    (user) => user.email === 'colaborador.demo@gmail.com',
  );
  if (!demoCollaborator) {
    throw new Error('Demo collaborator user not found');
  }

  const scoringItems: Array<{
    questionId: number;
    category: QuestionCategory;
    weight: number;
    normalizedScore: number;
  }> = [];

  for (const [order, responseValue] of Object.entries(DEMO_RESPONSES_BY_ORDER)) {
    const numericOrder = Number(order);
    const question = questionsByOrder.get(numericOrder);
    if (!question) {
      throw new Error(`Question for order ${numericOrder} was not created`);
    }

    const optionWeight = toOptionWeight(question.responseType, responseValue);
    const selectedOption = await prisma.assessmentQuestionOption.findFirst({
      where: {
        assessmentQuestionId: question.id,
        text: responseValue,
      },
    });

    let optionId = selectedOption?.id;
    if (!optionId) {
      const createdOption = await prisma.assessmentQuestionOption.create({
        data: {
          assessmentQuestionId: question.id,
          text: responseValue,
          weight: optionWeight,
          order: question.responseType === ResponseType.SCALE ? Number(responseValue) : undefined,
        },
      });
      optionId = createdOption.id;
    }

    await prisma.answer.upsert({
      where: {
        assessmentId_assessmentQuestionId_answeredBy: {
          assessmentId: assessment.id,
          assessmentQuestionId: question.id,
          answeredBy: demoCollaborator.id,
        },
      },
      create: {
        assessmentId: assessment.id,
        assessmentQuestionId: question.id,
        selectedOptionId: optionId,
        answeredBy: demoCollaborator.id,
      },
      update: {
        selectedOptionId: optionId,
      },
    });

    const normalizedScore = normalizeResponse(question.responseType, responseValue);
    const scoreDecimal = new Prisma.Decimal(normalizedScore);

    const existingResponse = await prisma.assessmentResponse.findFirst({
      where: {
        assessmentId: assessment.id,
        assessmentQuestionId: question.id,
        userId: demoCollaborator.id,
      },
      orderBy: { id: 'desc' },
    });

    if (existingResponse) {
      await prisma.assessmentResponse.update({
        where: { id: existingResponse.id },
        data: {
          questionId: null,
          assessmentQuestionId: question.id,
          selectedOptionId: optionId,
          userId: demoCollaborator.id,
          questionVersion: 1,
          responseValue,
          score: scoreDecimal,
          answeredAt: new Date(),
          observation: 'DEMO response',
        },
      });
    } else {
      await prisma.assessmentResponse.create({
        data: {
          assessmentId: assessment.id,
          questionId: null,
          assessmentQuestionId: question.id,
          selectedOptionId: optionId,
          userId: demoCollaborator.id,
          questionVersion: 1,
          responseValue,
          score: scoreDecimal,
          answeredAt: new Date(),
          observation: 'DEMO response',
        },
      });
    }

    scoringItems.push({
      questionId: question.id,
      category: (question.category ?? QuestionCategory.GOVERNANCA) as QuestionCategory,
      weight: Number(question.weight),
      normalizedScore,
    });
  }

  for (const collaborator of collaborators) {
    await prisma.assessmentAssignment.update({
      where: {
        assessmentId_userId: {
          assessmentId: assessment.id,
          userId: collaborator.id,
        },
      },
      data: {
        status:
          collaborator.id === demoCollaborator.id
            ? AssessmentAssignmentStatus.SUBMITTED
            : AssessmentAssignmentStatus.PENDING,
        submittedAt: collaborator.id === demoCollaborator.id ? new Date() : null,
      },
    });
  }

  const categoryWeightedSums: Record<QuestionCategory, number> = {
    [QuestionCategory.GOVERNANCA]: 0,
    [QuestionCategory.SEGURANCA]: 0,
    [QuestionCategory.PROCESSOS]: 0,
    [QuestionCategory.INFRAESTRUTURA]: 0,
    [QuestionCategory.CULTURA]: 0,
  };
  const categoryWeights: Record<QuestionCategory, number> = {
    [QuestionCategory.GOVERNANCA]: 0,
    [QuestionCategory.SEGURANCA]: 0,
    [QuestionCategory.PROCESSOS]: 0,
    [QuestionCategory.INFRAESTRUTURA]: 0,
    [QuestionCategory.CULTURA]: 0,
  };

  let totalWeight = 0;
  let totalWeightedSum = 0;

  for (const item of scoringItems) {
    totalWeight += item.weight;
    totalWeightedSum += item.normalizedScore * item.weight;

    categoryWeightedSums[item.category] += item.normalizedScore * item.weight;
    categoryWeights[item.category] += item.weight;
  }

  if (totalWeight <= 0) {
    throw new Error('Total weight must be greater than zero');
  }

  const round2 = (value: number) => Math.round(value * 100) / 100;

  const totalScore = round2(totalWeightedSum / totalWeight);
  const categoryScores: Record<QuestionCategory, number> = {
    [QuestionCategory.GOVERNANCA]:
      categoryWeights[QuestionCategory.GOVERNANCA] > 0
        ? round2(
            categoryWeightedSums[QuestionCategory.GOVERNANCA] /
              categoryWeights[QuestionCategory.GOVERNANCA],
          )
        : 0,
    [QuestionCategory.SEGURANCA]:
      categoryWeights[QuestionCategory.SEGURANCA] > 0
        ? round2(
            categoryWeightedSums[QuestionCategory.SEGURANCA] /
              categoryWeights[QuestionCategory.SEGURANCA],
          )
        : 0,
    [QuestionCategory.PROCESSOS]:
      categoryWeights[QuestionCategory.PROCESSOS] > 0
        ? round2(
            categoryWeightedSums[QuestionCategory.PROCESSOS] /
              categoryWeights[QuestionCategory.PROCESSOS],
          )
        : 0,
    [QuestionCategory.INFRAESTRUTURA]:
      categoryWeights[QuestionCategory.INFRAESTRUTURA] > 0
        ? round2(
            categoryWeightedSums[QuestionCategory.INFRAESTRUTURA] /
              categoryWeights[QuestionCategory.INFRAESTRUTURA],
          )
        : 0,
    [QuestionCategory.CULTURA]:
      categoryWeights[QuestionCategory.CULTURA] > 0
        ? round2(
            categoryWeightedSums[QuestionCategory.CULTURA] /
              categoryWeights[QuestionCategory.CULTURA],
          )
        : 0,
  };

  await prisma.assessment.update({
    where: { id: assessment.id },
    data: {
      status: AssessmentStatus.COMPLETED,
      startedAt: new Date(),
      completedAt: new Date(),
      score: totalScore,
      totalScore: new Prisma.Decimal(totalScore),
    },
  });

  await prisma.assessmentResult.upsert({
    where: { assessmentId: assessment.id },
    create: {
      assessmentId: assessment.id,
      totalScore,
      categoryScores: categoryScores as unknown as Prisma.InputJsonValue,
      categoryWeights: categoryWeights as unknown as Prisma.InputJsonValue,
    },
    update: {
      totalScore,
      categoryScores: categoryScores as unknown as Prisma.InputJsonValue,
      categoryWeights: categoryWeights as unknown as Prisma.InputJsonValue,
    },
  });

  // eslint-disable-next-line no-console
  console.log('Demo seed completed successfully.');
  // eslint-disable-next-line no-console
  console.log(`Company: ${company.name} (${company.companyCode})`);
  // eslint-disable-next-line no-console
  console.log(`Assessment ID: ${assessment.id}`);
  // eslint-disable-next-line no-console
  console.log(`Client login: haroldo@gmail.com / ${DEMO_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`Collaborator login: colaborador.demo@gmail.com / ${DEMO_PASSWORD}`);
  // eslint-disable-next-line no-console
  console.log(`Result endpoint: GET /assessments/${assessment.id}/result`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
