-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowDefinitionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowStep_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowStepExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "WorkflowStepExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowStepExecution_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "WorkflowInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowInstanceId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL DEFAULT 0,
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "WorkflowInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Membership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Approval" ("approverId", "createdAt", "decidedAt", "decisionNote", "id", "status", "tenantId", "workflowInstanceId") SELECT "approverId", "createdAt", "decidedAt", "decisionNote", "id", "status", "tenantId", "workflowInstanceId" FROM "Approval";
DROP TABLE "Approval";
ALTER TABLE "new_Approval" RENAME TO "Approval";
CREATE INDEX "Approval_tenantId_approverId_status_idx" ON "Approval"("tenantId", "approverId", "status");
CREATE INDEX "Approval_tenantId_workflowInstanceId_idx" ON "Approval"("tenantId", "workflowInstanceId");
CREATE TABLE "new_WorkflowDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "processDefinitionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definitionJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowDefinition_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkflowDefinition" ("createdAt", "definitionJson", "id", "name", "processDefinitionId", "status", "tenantId", "updatedAt", "version") SELECT "createdAt", "definitionJson", "id", "name", "processDefinitionId", "status", "tenantId", "updatedAt", "version" FROM "WorkflowDefinition";
DROP TABLE "WorkflowDefinition";
ALTER TABLE "new_WorkflowDefinition" RENAME TO "WorkflowDefinition";
CREATE INDEX "WorkflowDefinition_tenantId_status_idx" ON "WorkflowDefinition"("tenantId", "status");
CREATE UNIQUE INDEX "WorkflowDefinition_tenantId_name_version_key" ON "WorkflowDefinition"("tenantId", "name", "version");
CREATE TABLE "new_WorkflowInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "workflowDefinitionId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "currentStepOrder" INTEGER NOT NULL DEFAULT 0,
    "inputJson" TEXT,
    "contextJson" TEXT,
    "outputJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "WorkflowInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowInstance_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkflowInstance_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "Membership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_WorkflowInstance" ("completedAt", "id", "inputJson", "outputJson", "startedAt", "startedById", "status", "tenantId", "workflowDefinitionId") SELECT "completedAt", "id", "inputJson", "outputJson", "startedAt", "startedById", "status", "tenantId", "workflowDefinitionId" FROM "WorkflowInstance";
DROP TABLE "WorkflowInstance";
ALTER TABLE "new_WorkflowInstance" RENAME TO "WorkflowInstance";
CREATE INDEX "WorkflowInstance_tenantId_status_idx" ON "WorkflowInstance"("tenantId", "status");
CREATE INDEX "WorkflowInstance_tenantId_workflowDefinitionId_idx" ON "WorkflowInstance"("tenantId", "workflowDefinitionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WorkflowStep_tenantId_workflowDefinitionId_order_idx" ON "WorkflowStep"("tenantId", "workflowDefinitionId", "order");

-- CreateIndex
CREATE INDEX "WorkflowStepExecution_tenantId_workflowInstanceId_idx" ON "WorkflowStepExecution"("tenantId", "workflowInstanceId");
