-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "assetCategory" TEXT,
ADD COLUMN     "assetName" TEXT,
ADD COLUMN     "existingControls" TEXT,
ADD COLUMN     "inherentImpact" "RiskImpact",
ADD COLUMN     "inherentProbability" "RiskProbability",
ADD COLUMN     "inherentScore" INTEGER,
ADD COLUMN     "proposedControls" TEXT,
ADD COLUMN     "residualImpact" "RiskImpact",
ADD COLUMN     "residualLevel" TEXT,
ADD COLUMN     "residualProbability" "RiskProbability",
ADD COLUMN     "residualScore" INTEGER,
ADD COLUMN     "threat" TEXT,
ADD COLUMN     "vulnerability" TEXT;
