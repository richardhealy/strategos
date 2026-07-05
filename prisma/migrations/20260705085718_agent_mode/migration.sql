-- CreateEnum
CREATE TYPE "ProjectMode" AS ENUM ('HUMAN', 'AI');

-- CreateEnum
CREATE TYPE "ReadinessStatus" AS ENUM ('READY', 'NEEDS_SPEC', 'BLOCKED');

-- AlterEnum
ALTER TYPE "ProposalKind" ADD VALUE 'DISPATCH_PLAN';

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN     "mode" "ProjectMode" NOT NULL DEFAULT 'HUMAN';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "description" TEXT,
ADD COLUMN     "readiness" "ReadinessStatus",
ADD COLUMN     "readinessAt" TIMESTAMP(3),
ADD COLUMN     "readinessReason" TEXT;

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "blockedTaskId" TEXT NOT NULL,
    "blockerTaskId" TEXT NOT NULL,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskDependency_blockedTaskId_idx" ON "TaskDependency"("blockedTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_blockedTaskId_blockerTaskId_key" ON "TaskDependency"("blockedTaskId", "blockerTaskId");

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockedTaskId_fkey" FOREIGN KEY ("blockedTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockerTaskId_fkey" FOREIGN KEY ("blockerTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
