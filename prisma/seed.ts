import { PrismaClient, QuestionCategory, ResponseType } from '@prisma/client';
import { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type SeedQuestion = {
  text: string;
  category: QuestionCategory;
  weight?: number;
  responseType?: ResponseType;
  sortOrder: number;
};

const maturityOptions = [
  { label: 'Inexistente', scoreValue: 0, sortOrder: 0 },
  { label: 'Inicial', scoreValue: 1, sortOrder: 1 },
  { label: 'Repetível', scoreValue: 2, sortOrder: 2 },
  { label: 'Definido', scoreValue: 3, sortOrder: 3 },
  { label: 'Gerenciado', scoreValue: 4, sortOrder: 4 },
  { label: 'Otimizado', scoreValue: 5, sortOrder: 5 },
] as const;

function q(
  sortOrder: number,
  category: QuestionCategory,
  text: string,
): SeedQuestion {
  return { sortOrder, category, text, weight: 1.0, responseType: ResponseType.SCALE };
}

async function upsertTemplate(params: {
  name: string;
  description: string;
  questions: SeedQuestion[];
}) {
  const existing = await prisma.questionnaireTemplate.findFirst({
    where: { name: params.name },
    select: { id: true },
  });

  return prisma.$transaction(
    async (tx) => {
    let templateId: number;
    if (existing) {
      templateId = existing.id;
      await tx.questionnaireTemplate.update({
        where: { id: templateId },
        data: {
          description: params.description,
          isActive: true,
        },
      });

      // Ensure idempotency: wipe template questions/options and recreate the canonical set.
      await tx.questionTemplate.deleteMany({
        where: { questionnaireTemplateId: templateId },
      });
    } else {
      const created = await tx.questionnaireTemplate.create({
        data: {
          name: params.name,
          description: params.description,
          isActive: true,
        },
        select: { id: true },
      });
      templateId = created.id;
    }

    await tx.questionTemplate.createMany({
      data: params.questions.map((question) => ({
        questionnaireTemplateId: templateId,
        text: question.text,
        category: question.category,
        weight: new Prisma.Decimal(question.weight ?? 1.0),
        responseType: question.responseType ?? ResponseType.SCALE,
        evidenceRequired: false,
        hint: null,
        sortOrder: question.sortOrder,
      })),
    });

    const createdQuestions = await tx.questionTemplate.findMany({
      where: { questionnaireTemplateId: templateId },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    await tx.questionTemplateOption.createMany({
      data: createdQuestions.flatMap((question) =>
        maturityOptions.map((o) => ({
          questionTemplateId: question.id,
          label: o.label,
          scoreValue: new Prisma.Decimal(o.scoreValue),
          sortOrder: o.sortOrder,
        })),
      ),
    });

    return tx.questionnaireTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { questions: { include: { options: true } } },
    });
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

async function main() {
  const basicQuestions: SeedQuestion[] = [
    // GOVERNANCA
    q(0, QuestionCategory.GOVERNANCA, 'Existe um modelo de governança de TI formal (papéis, responsabilidades e comitês) em operação?'),
    q(1, QuestionCategory.GOVERNANCA, 'As decisões de TI são alinhadas à estratégia do negócio com indicadores e prestação de contas?'),
    q(2, QuestionCategory.GOVERNANCA, 'Há gestão de portfólio de iniciativas de TI com priorização e benefícios acompanhados?'),
    // SEGURANCA
    q(3, QuestionCategory.SEGURANCA, 'Existe política de segurança da informação aprovada, comunicada e revisada periodicamente?'),
    q(4, QuestionCategory.SEGURANCA, 'Controles de acesso (IAM) são gerenciados com revisão periódica de permissões e segregação de funções?'),
    q(5, QuestionCategory.SEGURANCA, 'Incidentes de segurança são registrados, tratados com SLA e lições aprendidas aplicadas?'),
    // PROCESSOS
    q(6, QuestionCategory.PROCESSOS, 'Existe processo formal de gestão de mudanças com aprovação, janela e rastreabilidade?'),
    q(7, QuestionCategory.PROCESSOS, 'Existe processo de gestão de incidentes com priorização, escalonamento e métricas (MTTR, backlog)?'),
    q(8, QuestionCategory.PROCESSOS, 'Existe processo de gestão de problemas e causa raiz (RCA) com ações preventivas monitoradas?'),
    // INFRAESTRUTURA
    q(9, QuestionCategory.INFRAESTRUTURA, 'A infraestrutura é monitorada proativamente com alertas e capacidade planejada?'),
    q(10, QuestionCategory.INFRAESTRUTURA, 'Backups são realizados, testados (restore) e atendem RPO/RTO definidos?'),
    q(11, QuestionCategory.INFRAESTRUTURA, 'Há padronização e automação (IaC/CI-CD) para provisionamento e deploy?'),
    // CULTURA
    q(12, QuestionCategory.CULTURA, 'Existe cultura de melhoria contínua em TI com cadência de retrospectivas e ações mensuráveis?'),
    q(13, QuestionCategory.CULTURA, 'As equipes possuem treinamento recorrente em boas práticas (segurança, processos, qualidade)?'),
    q(14, QuestionCategory.CULTURA, 'Existe colaboração efetiva entre TI e negócio (comunicação, feedback e gestão de expectativas)?'),
  ];

  const securityFocusQuestions: SeedQuestion[] = [
    // GOVERNANCA
    q(0, QuestionCategory.GOVERNANCA, 'Existe responsável formal por segurança (ex.: CISO/PO de Segurança) com governança e orçamento definidos?'),
    q(1, QuestionCategory.GOVERNANCA, 'Riscos de TI/Segurança são avaliados periodicamente e reportados à liderança com plano de tratamento?'),
    q(2, QuestionCategory.GOVERNANCA, 'Existe conformidade com normas/padrões (ex.: ISO 27001, LGPD) com evidências e auditorias?'),
    // SEGURANCA
    q(3, QuestionCategory.SEGURANCA, 'Existe inventário de ativos e classificação de informações para definir controles adequados?'),
    q(4, QuestionCategory.SEGURANCA, 'Vulnerabilidades são gerenciadas com varreduras, priorização e correção dentro de SLAs?'),
    q(5, QuestionCategory.SEGURANCA, 'Logs de segurança são centralizados (SIEM/observabilidade) com detecção e resposta definida?'),
    q(6, QuestionCategory.SEGURANCA, 'Existe gestão de identidades com MFA, políticas de senha e controle de acesso privilegiado (PAM)?'),
    q(7, QuestionCategory.SEGURANCA, 'Existe processo de gestão de incidentes com runbooks, simulações e pós-incidente estruturado?'),
    q(8, QuestionCategory.SEGURANCA, 'Dados sensíveis são protegidos (criptografia em trânsito/repouso) e chaves são gerenciadas adequadamente?'),
    q(9, QuestionCategory.SEGURANCA, 'Segurança é integrada ao ciclo de desenvolvimento (DevSecOps) com SAST/DAST e revisão de dependências?'),
    q(10, QuestionCategory.SEGURANCA, 'Existe continuidade e recuperação (BCP/DRP) testadas e aderentes a RTO/RPO?'),
    q(11, QuestionCategory.SEGURANCA, 'Terceiros (fornecedores) são avaliados quanto a riscos de segurança e têm requisitos contratuais?'),
  ];

  const operationsItilQuestions: SeedQuestion[] = [
    // PROCESSOS (ITIL)
    q(0, QuestionCategory.PROCESSOS, 'Existe catálogo de serviços de TI com definição de SLA/OLA e responsáveis?'),
    q(1, QuestionCategory.PROCESSOS, 'Incidentes são gerenciados com priorização, escalonamento e métricas de performance (ex.: MTTR)?'),
    q(2, QuestionCategory.PROCESSOS, 'Requisições de serviço são atendidas por fluxos padronizados e automatizados (ex.: portal/service desk)?'),
    q(3, QuestionCategory.PROCESSOS, 'Mudanças são avaliadas por risco/impacto e aprovadas em um CAB (ou equivalente)?'),
    q(4, QuestionCategory.PROCESSOS, 'Existe gestão de problemas (RCA) para evitar recorrência de incidentes críticos?'),
    q(5, QuestionCategory.PROCESSOS, 'Configurações/ativos são gerenciados (CMDB ou inventário confiável) para suportar operação e mudanças?'),
    q(6, QuestionCategory.PROCESSOS, 'Existe gestão de níveis de serviço com revisão periódica e melhoria baseada em dados?'),
    // INFRAESTRUTURA
    q(7, QuestionCategory.INFRAESTRUTURA, 'Monitoramento e observabilidade cobrem disponibilidade, performance e capacidade com alertas acionáveis?'),
    q(8, QuestionCategory.INFRAESTRUTURA, 'Existe padronização de ambientes (dev/hml/prod) e controle de versões/rollback nos deploys?'),
    q(9, QuestionCategory.INFRAESTRUTURA, 'Backups e restores são testados e documentados com responsabilidades claras?'),
    q(10, QuestionCategory.INFRAESTRUTURA, 'Existe gestão de capacidade e custos (FinOps) com previsões e otimizações recorrentes?'),
    q(11, QuestionCategory.INFRAESTRUTURA, 'Existe gestão de disponibilidade com redundância, testes e planos de contingência?'),
  ];

  await upsertTemplate({
    name: 'ASCEND MATURITY BASIC',
    description:
      'Modelo base de maturidade de TI (cobre Governança, Segurança, Processos, Infraestrutura e Cultura) com escala 0–5.',
    questions: basicQuestions,
  });

  await upsertTemplate({
    name: 'ASCEND SECURITY FOCUS',
    description:
      'Modelo focado em Segurança + Governança (baseado em práticas de gestão de riscos, controles e resposta a incidentes) com escala 0–5.',
    questions: securityFocusQuestions,
  });

  await upsertTemplate({
    name: 'ASCEND OPERATIONS (ITIL BASED)',
    description:
      'Modelo de Operações baseado em ITIL (foco em Processos + Infraestrutura) com escala 0–5.',
    questions: operationsItilQuestions,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

