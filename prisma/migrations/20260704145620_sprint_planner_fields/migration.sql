-- AlterEnum
ALTER TYPE "ProposalKind" ADD VALUE 'SPRINT_PLAN';

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN     "managed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "priority" INTEGER;
