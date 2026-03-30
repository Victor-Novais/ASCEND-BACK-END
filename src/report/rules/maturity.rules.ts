import { MaturityLevel } from '@prisma/client';


export function maturityFromTotalScore(totalScore: number): MaturityLevel {
  if (totalScore < 25) {
    return MaturityLevel.ARTESANAL;
  }
  if (totalScore < 50) {
    return MaturityLevel.EFICIENTE;
  }
  if (totalScore < 75) {
    return MaturityLevel.EFICAZ;
  }
  return MaturityLevel.ESTRATEGICO;
}
