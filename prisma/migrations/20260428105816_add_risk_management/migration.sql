-- DropForeignKey
ALTER TABLE "Risk" DROP CONSTRAINT "Risk_assessmentId_fkey";

-- DropForeignKey
ALTER TABLE "Risk" DROP CONSTRAINT "Risk_companyId_fkey";

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
