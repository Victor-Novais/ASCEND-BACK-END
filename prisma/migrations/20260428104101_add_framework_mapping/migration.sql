/*
  Warnings:

  - Made the column `frameworkType` on table `Question` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "frameworkType" SET NOT NULL,
ALTER COLUMN "frameworkType" SET DEFAULT 'PROPRIO';
