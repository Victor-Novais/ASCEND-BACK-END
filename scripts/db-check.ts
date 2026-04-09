import { PrismaClient } from '@prisma/client';

async function main() {

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.questionnaireTemplate.findMany({
      select: { id: true, name: true, isActive: true },
      orderBy: { id: 'asc' },
    });
   
    console.log('TEMPLATE_ROWS', rows.length);
   
    console.log('TEMPLATES', rows);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {

  console.error(e);
  process.exit(1);
});

