-- Performance indexes — add missing indexes for common query patterns

-- DocumentOrganizationPermission: missing tenantId index
CREATE INDEX IF NOT EXISTS "DocumentOrganizationPermission_tenantId_documentId_idx" ON "DocumentOrganizationPermission"("tenantId", "documentId");

-- Document: missing [tenantId, status] composite (status is filtered in nearly every query)
CREATE INDEX IF NOT EXISTS "Document_tenantId_status_idx" ON "Document"("tenantId", "status");

-- ListItem: missing [tenantId, listDefinitionId, createdAt] for date-sorted pagination
CREATE INDEX IF NOT EXISTS "ListItem_tenantId_listDefinitionId_createdAt_idx" ON "ListItem"("tenantId", "listDefinitionId", "createdAt");

-- Task: missing [tenantId, status, dueAt] for "upcoming tasks by status" dashboard query
CREATE INDEX IF NOT EXISTS "Task_tenantId_status_dueAt_idx" ON "Task"("tenantId", "status", "dueAt");

-- AuditLog: missing [tenantId, result, occurredAt] for filter+date-range query
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_result_occurredAt_idx" ON "AuditLog"("tenantId", "result", "occurredAt");

-- createdById indexes (FK → User, onDelete: Restrict) — systemic gap
CREATE INDEX IF NOT EXISTS "Folder_createdById_idx" ON "Folder"("createdById");
CREATE INDEX IF NOT EXISTS "Document_createdById_idx" ON "Document"("createdById");
CREATE INDEX IF NOT EXISTS "DocumentShareLink_createdById_idx" ON "DocumentShareLink"("createdById");
CREATE INDEX IF NOT EXISTS "DocumentVersion_createdById_idx" ON "DocumentVersion"("createdById");
CREATE INDEX IF NOT EXISTS "ListDefinition_createdById_idx" ON "ListDefinition"("createdById");
CREATE INDEX IF NOT EXISTS "ListItem_createdById_idx" ON "ListItem"("createdById");
CREATE INDEX IF NOT EXISTS "FormDefinition_createdById_idx" ON "FormDefinition"("createdById");
CREATE INDEX IF NOT EXISTS "Project_createdById_idx" ON "Project"("createdById");
CREATE INDEX IF NOT EXISTS "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_createdById_idx" ON "WorkflowDefinition"("createdById");

-- Other missing FK indexes
CREATE INDEX IF NOT EXISTS "Task_documentId_idx" ON "Task"("documentId");
CREATE INDEX IF NOT EXISTS "TaskComment_authorId_idx" ON "TaskComment"("authorId");
CREATE INDEX IF NOT EXISTS "FormSubmission_submittedById_idx" ON "FormSubmission"("submittedById");
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_processDefinitionId_idx" ON "WorkflowDefinition"("processDefinitionId");
CREATE INDEX IF NOT EXISTS "WorkflowInstance_startedById_idx" ON "WorkflowInstance"("startedById");
CREATE INDEX IF NOT EXISTS "Approval_delegatedById_idx" ON "Approval"("delegatedById");
CREATE INDEX IF NOT EXISTS "ApprovalComment_authorId_idx" ON "ApprovalComment"("authorId");
CREATE INDEX IF NOT EXISTS "ApprovalDelegation_fromMemberId_idx" ON "ApprovalDelegation"("fromMemberId");
CREATE INDEX IF NOT EXISTS "ApprovalDelegation_toMemberId_idx" ON "ApprovalDelegation"("toMemberId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "AIOperation_userId_idx" ON "AIOperation"("userId");
CREATE INDEX IF NOT EXISTS "ListField_relationListId_idx" ON "ListField"("relationListId");
