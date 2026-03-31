-- CreateTable
CREATE TABLE "Answer" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "assessmentQuestionId" INTEGER NOT NULL,
    "selectedOptionId" INTEGER NOT NULL,
    "answeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Answer_assessmentId_answeredBy_idx" ON "Answer"("assessmentId", "answeredBy");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_assessmentId_assessmentQuestionId_answeredBy_key" ON "Answer"("assessmentId", "assessmentQuestionId", "answeredBy");

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "AssessmentQuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
