-- Phase roadmap: workflow event triggers, quick actions, announcements,
-- per-document records/legal hold + governance overrides.

-- Document: records management + per-document governance overrides
ALTER TABLE "Document" ADD COLUMN "isRecord" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "sensitivity" TEXT;
ALTER TABLE "Document" ADD COLUMN "retentionMode" TEXT;
ALTER TABLE "Document" ADD COLUMN "retentionDays" INTEGER;

-- WorkflowTrigger: start a workflow definition when an event fires
CREATE TABLE "WorkflowTrigger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowDefinitionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'organization',
    "scopeId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowTrigger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowTrigger_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkflowTrigger_tenantId_event_enabled_idx" ON "WorkflowTrigger"("tenantId", "event", "enabled");
CREATE INDEX "WorkflowTrigger_tenantId_workflowDefinitionId_idx" ON "WorkflowTrigger"("tenantId", "workflowDefinitionId");

-- QuickAction: one-click action that starts a workflow for an item
CREATE TABLE "QuickAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'document',
    "workflowDefinitionId" TEXT NOT NULL,
    "scopeId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuickAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuickAction_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QuickAction_tenantId_targetType_idx" ON "QuickAction"("tenantId", "targetType");

-- Announcement: internal news with audience targeting
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "publishAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Announcement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Announcement_tenantId_publishAt_idx" ON "Announcement"("tenantId", "publishAt");
