-- AlterTable
ALTER TABLE "ActionPlan" ADD COLUMN     "howMethod" TEXT,
ADD COLUMN     "howMuchCost" DECIMAL(12,2),
ADD COLUMN     "howMuchCurrency" TEXT DEFAULT 'BRL',
ADD COLUMN     "whatObjective" TEXT,
ADD COLUMN     "whereLocation" TEXT,
ADD COLUMN     "whyJustification" TEXT;
