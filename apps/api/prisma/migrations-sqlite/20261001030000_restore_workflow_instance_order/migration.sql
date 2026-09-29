-- Rebuild WorkflowInstance so it is recreated after WorkflowDefinition in
-- sqlite_master order. The previous table rebuild moved WorkflowDefinition to
-- the end of the catalog, which changed cascade processing order and caused
-- ON DELETE RESTRICT violations when deleting an organization with instances.

PRAGMA foreign_keys=OFF;

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

INSERT INTO "new_WorkflowInstance" ("id", "tenantId", "workflowDefinitionId", "startedById", "status", "currentStepOrder", "inputJson", "contextJson", "outputJson", "errorMessage", "startedAt", "completedAt")
SELECT "id", "tenantId", "workflowDefinitionId", "startedById", "status", "currentStepOrder", "inputJson", "contextJson", "outputJson", "errorMessage", "startedAt", "completedAt" FROM "WorkflowInstance";

DROP TABLE "WorkflowInstance";
ALTER TABLE "new_WorkflowInstance" RENAME TO "WorkflowInstance";

CREATE INDEX "WorkflowInstance_tenantId_status_idx" ON "WorkflowInstance"("tenantId", "status");
CREATE INDEX "WorkflowInstance_tenantId_workflowDefinitionId_idx" ON "WorkflowInstance"("tenantId", "workflowDefinitionId");
CREATE INDEX "WorkflowInstance_startedById_idx" ON "WorkflowInstance"("startedById");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
