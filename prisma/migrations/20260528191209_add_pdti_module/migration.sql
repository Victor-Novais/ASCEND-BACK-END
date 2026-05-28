-- CreateTable
CREATE TABLE "PDTI" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "assessmentId" INTEGER,
    "createdById" UUID,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "vision" TEXT,
    "mission" TEXT,
    "strategicGoals" TEXT,
    "summary" TEXT,
    "generatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDTI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDTIObjective" (
    "id" SERIAL NOT NULL,
    "pdtiId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "targetValue" TEXT,
    "actualValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDTIObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDTIAction" (
    "id" SERIAL NOT NULL,
    "objectiveId" INTEGER NOT NULL,
    "actionPlanId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANEJADO',
    "dueDate" TIMESTAMP(3),
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDTIAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PDTIIndicator" (
    "id" SERIAL NOT NULL,
    "pdtiId" INTEGER NOT NULL,
    "objectiveId" INTEGER,
    "name" TEXT NOT NULL,
    "formula" TEXT,
    "unit" TEXT,
    "baseline" TEXT,
    "target" TEXT,
    "currentValue" TEXT,
    "frequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PDTIIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PDTI_companyId_idx" ON "PDTI"("companyId");

-- CreateIndex
CREATE INDEX "PDTI_assessmentId_idx" ON "PDTI"("assessmentId");

-- CreateIndex
CREATE INDEX "PDTI_createdById_idx" ON "PDTI"("createdById");

-- CreateIndex
CREATE INDEX "PDTIObjective_pdtiId_idx" ON "PDTIObjective"("pdtiId");

-- CreateIndex
CREATE INDEX "PDTIAction_objectiveId_idx" ON "PDTIAction"("objectiveId");

-- CreateIndex
CREATE INDEX "PDTIAction_actionPlanId_idx" ON "PDTIAction"("actionPlanId");

-- CreateIndex
CREATE INDEX "PDTIIndicator_pdtiId_idx" ON "PDTIIndicator"("pdtiId");

-- CreateIndex
CREATE INDEX "PDTIIndicator_objectiveId_idx" ON "PDTIIndicator"("objectiveId");

-- AddForeignKey
ALTER TABLE "PDTI" ADD CONSTRAINT "PDTI_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDTI" ADD CONSTRAINT "PDTI_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDTI" ADD CONSTRAINT "PDTI_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDTIObjective" ADD CONSTRAINT "PDTIObjective_pdtiId_fkey" FOREIGN KEY ("pdtiId") REFERENCES "PDTI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDTIAction" ADD CONSTRAINT "PDTIAction_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "PDTIObjective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDTIAction" ADD CONSTRAINT "PDTIAction_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDTIIndicator" ADD CONSTRAINT "PDTIIndicator_pdtiId_fkey" FOREIGN KEY ("pdtiId") REFERENCES "PDTI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PDTIIndicator" ADD CONSTRAINT "PDTIIndicator_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "PDTIObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
