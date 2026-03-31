/*
  Warnings:

  - You are about to drop the column `questionTemplateId` on the `AssessmentResponse` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AssessmentResponse" DROP CONSTRAINT "AssessmentResponse_questionTemplateId_fkey";

-- DropIndex
DROP INDEX "AssessmentResponse_assessmentId_questionTemplateId_idx";

-- AlterTable
ALTER TABLE "AssessmentResponse" DROP COLUMN "questionTemplateId",
ADD COLUMN     "assessmentQuestionId" INTEGER,
ADD COLUMN     "selectedOptionId" INTEGER;

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" "QuestionCategory",
    "order" INTEGER,
    "responseType" "ResponseType" NOT NULL,
    "weight" DECIMAL(3,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionOption" (
    "id" SERIAL NOT NULL,
    "assessmentQuestionId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "order" INTEGER,

    CONSTRAINT "AssessmentQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentQuestionOption_assessmentQuestionId_idx" ON "AssessmentQuestionOption"("assessmentQuestionId");

-- CreateIndex
CREATE INDEX "AssessmentResponse_assessmentId_assessmentQuestionId_idx" ON "AssessmentResponse"("assessmentId", "assessmentQuestionId");

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionOption" ADD CONSTRAINT "AssessmentQuestionOption_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
