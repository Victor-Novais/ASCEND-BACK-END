-- CreateEnum
CREATE TYPE "FrameworkType" AS ENUM ('COBIT', 'ITIL', 'ISO_27000', 'PROPRIO');

-- CreateEnum
CREATE TYPE "ActionPlanStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ActionPlanPriority" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "frameworkNote" TEXT,
ADD COLUMN     "frameworkRef" TEXT,
ADD COLUMN     "frameworkType" "FrameworkType";

-- CreateTable
CREATE TABLE "ActionPlan" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "frameworkRef" TEXT,
    "priority" "ActionPlanPriority" NOT NULL DEFAULT 'MEDIA',
    "status" "ActionPlanStatus" NOT NULL DEFAULT 'PENDENTE',
    "responsibleId" UUID,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionPlan_assessmentId_idx" ON "ActionPlan"("assessmentId");

-- CreateIndex
CREATE INDEX "ActionPlan_companyId_idx" ON "ActionPlan"("companyId");

-- CreateIndex
CREATE INDEX "ActionPlan_status_idx" ON "ActionPlan"("status");

-- CreateIndex
CREATE INDEX "ActionPlan_priority_idx" ON "ActionPlan"("priority");

-- CreateIndex
CREATE INDEX "ActionPlan_responsibleId_idx" ON "ActionPlan"("responsibleId");

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
