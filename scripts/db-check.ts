import { PrismaClient } from '@prisma/client';

async function main() {
  // Avoid printing secrets; just confirm connectivity + counts.
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.questionnaireTemplate.findMany({
      select: { id: true, name: true, isActive: true },
      orderBy: { id: 'asc' },
    });
    // eslint-disable-next-line no-console
    console.log('TEMPLATE_ROWS', rows.length);
    // eslint-disable-next-line no-console
    console.log('TEMPLATES', rows);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

