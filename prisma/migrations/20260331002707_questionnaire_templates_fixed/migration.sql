-- CreateEnum
CREATE TYPE "AssessmentAssignmentStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- DropForeignKey
ALTER TABLE "AssessmentResponse" DROP CONSTRAINT "AssessmentResponse_questionId_fkey";

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "questionnaireTemplateId" INTEGER;

-- AlterTable
ALTER TABLE "AssessmentResponse" ADD COLUMN     "questionTemplateId" INTEGER,
ADD COLUMN     "userId" UUID,
ALTER COLUMN "questionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "QuestionnaireTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionnaireTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTemplate" (
    "id" SERIAL NOT NULL,
    "questionnaireTemplateId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "weight" DECIMAL(3,2) NOT NULL,
    "responseType" "ResponseType" NOT NULL,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT false,
    "hint" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionTemplateOption" (
    "id" SERIAL NOT NULL,
    "questionTemplateId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "scoreValue" DECIMAL(4,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionTemplateOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAssignment" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "userId" UUID NOT NULL,
    "status" "AssessmentAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionTemplate_questionnaireTemplateId_idx" ON "QuestionTemplate"("questionnaireTemplateId");

-- CreateIndex
CREATE INDEX "QuestionTemplateOption_questionTemplateId_idx" ON "QuestionTemplateOption"("questionTemplateId");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_userId_idx" ON "AssessmentAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAssignment_assessmentId_userId_key" ON "AssessmentAssignment"("assessmentId", "userId");

-- CreateIndex
CREATE INDEX "AssessmentResponse_assessmentId_userId_idx" ON "AssessmentResponse"("assessmentId", "userId");

-- CreateIndex
CREATE INDEX "AssessmentResponse_assessmentId_questionTemplateId_idx" ON "AssessmentResponse"("assessmentId", "questionTemplateId");

-- AddForeignKey
ALTER TABLE "QuestionTemplate" ADD CONSTRAINT "QuestionTemplate_questionnaireTemplateId_fkey" FOREIGN KEY ("questionnaireTemplateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionTemplateOption" ADD CONSTRAINT "QuestionTemplateOption_questionTemplateId_fkey" FOREIGN KEY ("questionTemplateId") REFERENCES "QuestionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_questionnaireTemplateId_fkey" FOREIGN KEY ("questionnaireTemplateId") REFERENCES "QuestionnaireTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_questionTemplateId_fkey" FOREIGN KEY ("questionTemplateId") REFERENCES "QuestionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
