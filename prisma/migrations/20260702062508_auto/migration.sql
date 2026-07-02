-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('LINEAR', 'JIRA', 'GITHUB', 'GITLAB', 'AZURE_DEVOPS');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('BACKLOG', 'PLANNED', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskKind" AS ENUM ('SCHEDULE', 'DEPENDENCY', 'BLOCKER', 'TEAM');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "VelocityTrend" AS ENUM ('DROPPING', 'STABLE', 'RISING');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('COMMUNICATION', 'TICKET_WRITE', 'PLAN_CHANGE');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'PLANNED',
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "teamId" TEXT,
    "title" TEXT NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'BACKLOG',
    "estimatePoints" DOUBLE PRECISION,
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "epicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'BACKLOG',
    "estimatePoints" DOUBLE PRECISION,
    "assignee" TEXT,
    "criticalPath" BOOLEAN NOT NULL DEFAULT false,
    "stalledSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dependency" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VelocitySnapshot" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "completedPts" DOUBLE PRECISION NOT NULL,
    "committedPts" DOUBLE PRECISION NOT NULL,
    "trend" "VelocityTrend" NOT NULL DEFAULT 'STABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VelocitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskScore" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "kind" "RiskKind" NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "explanation" TEXT NOT NULL,
    "mitigation" TEXT,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalRef" (
    "id" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initiativeId" TEXT,
    "epicId" TEXT,
    "taskId" TEXT,

    CONSTRAINT "ExternalRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StateChange" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "source" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "proposalId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HitlProposal" (
    "id" TEXT NOT NULL,
    "kind" "ProposalKind" NOT NULL,
    "state" "ProposalState" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "reason" TEXT,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "HitlProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationDraft" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "audience" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "gradeScore" DOUBLE PRECISION,
    "gradePass" BOOLEAN,
    "gradeReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "lastSynced" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Initiative_programId_status_idx" ON "Initiative"("programId", "status");

-- CreateIndex
CREATE INDEX "Epic_initiativeId_status_idx" ON "Epic"("initiativeId", "status");

-- CreateIndex
CREATE INDEX "Task_epicId_status_idx" ON "Task"("epicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Dependency_fromId_toId_key" ON "Dependency"("fromId", "toId");

-- CreateIndex
CREATE INDEX "VelocitySnapshot_teamId_periodStart_idx" ON "VelocitySnapshot"("teamId", "periodStart");

-- CreateIndex
CREATE INDEX "RiskScore_initiativeId_kind_computedAt_idx" ON "RiskScore"("initiativeId", "kind", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRef_initiativeId_key" ON "ExternalRef"("initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRef_epicId_key" ON "ExternalRef"("epicId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRef_taskId_key" ON "ExternalRef"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRef_kind_externalId_key" ON "ExternalRef"("kind", "externalId");

-- CreateIndex
CREATE INDEX "StateChange_entityType_entityId_at_idx" ON "StateChange"("entityType", "entityId", "at");

-- CreateIndex
CREATE INDEX "ActionLog_actor_at_idx" ON "ActionLog"("actor", "at");

-- CreateIndex
CREATE INDEX "HitlProposal_state_kind_createdAt_idx" ON "HitlProposal"("state", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationDraft_proposalId_key" ON "CommunicationDraft"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCursor_kind_resource_key" ON "SyncCursor"("kind", "resource");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Epic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Epic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VelocitySnapshot" ADD CONSTRAINT "VelocitySnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskScore" ADD CONSTRAINT "RiskScore_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalRef" ADD CONSTRAINT "ExternalRef_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalRef" ADD CONSTRAINT "ExternalRef_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalRef" ADD CONSTRAINT "ExternalRef_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HitlProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationDraft" ADD CONSTRAINT "CommunicationDraft_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HitlProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
