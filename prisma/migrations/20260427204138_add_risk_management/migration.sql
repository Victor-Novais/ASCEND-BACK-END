-- CreateEnum
CREATE TYPE "RiskProbability" AS ENUM ('MUITO_BAIXA', 'BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA');

-- CreateEnum
CREATE TYPE "RiskImpact" AS ENUM ('MUITO_BAIXO', 'BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('IDENTIFICADO', 'EM_TRATAMENTO', 'MITIGADO', 'ACEITO', 'TRANSFERIDO');

-- CreateTable
CREATE TABLE "Risk" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "frameworkRef" TEXT,
    "probability" "RiskProbability" NOT NULL,
    "impact" "RiskImpact" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'IDENTIFICADO',
    "treatment" TEXT,
    "responsibleId" UUID,
    "reviewDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Risk_assessmentId_idx" ON "Risk"("assessmentId");

-- CreateIndex
CREATE INDEX "Risk_companyId_idx" ON "Risk"("companyId");

-- CreateIndex
CREATE INDEX "Risk_status_idx" ON "Risk"("status");

-- CreateIndex
CREATE INDEX "Risk_riskLevel_idx" ON "Risk"("riskLevel");

-- CreateIndex
CREATE INDEX "Risk_category_idx" ON "Risk"("category");

-- CreateIndex
CREATE INDEX "Risk_responsibleId_idx" ON "Risk"("responsibleId");

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
