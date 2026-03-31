import { MaturityLevel } from '@prisma/client';

export function getMaturity(score: number): string {
  if (score <= 20) return 'Inicial';
  if (score <= 40) return 'Básico';
  if (score <= 60) return 'Intermediário';
  if (score <= 80) return 'Avançado';
  return 'Otimizado';
}

export function mapMaturityLabelToEnum(label: string): MaturityLevel {
  if (label === 'Inicial') return MaturityLevel.ARTESANAL;
  if (label === 'Básico') return MaturityLevel.EFICIENTE;
  if (label === 'Intermediário') return MaturityLevel.EFICAZ;
  return MaturityLevel.ESTRATEGICO;
}
