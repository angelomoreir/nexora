-- CreateTable: Plan
CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "priceAnnual" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "featuresJson" TEXT NOT NULL DEFAULT '[]',
    "limitsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_code_key" ON "Plan"("code");

-- CreateTable: OrganizationSubscription
CREATE TABLE IF NOT EXISTS "OrganizationSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "trialEndsAt" DATETIME,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSubscription_tenantId_key" ON "OrganizationSubscription"("tenantId");
CREATE INDEX IF NOT EXISTS "OrganizationSubscription_planId_idx" ON "OrganizationSubscription"("planId");
CREATE INDEX IF NOT EXISTS "OrganizationSubscription_status_idx" ON "OrganizationSubscription"("status");

-- Seed default plans
INSERT INTO "Plan" ("id", "code", "name", "description", "priceMonthly", "priceAnnual", "currency", "isActive", "sortOrder", "featuresJson", "limitsJson", "updatedAt") VALUES
('plan_free', 'free', 'Free', 'Plano gratuito para começar', 0, 0, 'EUR', 1, 0, '["documents","lists","forms","tasks","workflows","approvals","notifications","search"]', '{"maxUsers":5,"maxStorageBytes":1073741824,"maxDocuments":100,"maxOrganizations":1,"maxWorkflows":5,"aiRequestsPerMonth":50}', CURRENT_TIMESTAMP),
('plan_basic', 'basic', 'Basic', 'Para pequenas equipas', 1900, 19000, 'EUR', 1, 1, '["documents","lists","forms","tasks","workflows","approvals","notifications","search","ai_assistant"]', '{"maxUsers":15,"maxStorageBytes":10737418240,"maxDocuments":1000,"maxOrganizations":1,"maxWorkflows":20,"aiRequestsPerMonth":500}', CURRENT_TIMESTAMP),
('plan_professional', 'professional', 'Professional', 'Para equipas em crescimento', 4900, 49000, 'EUR', 1, 2, '["documents","lists","forms","tasks","workflows","approvals","notifications","search","ai_assistant","custom_roles","audit_export"]', '{"maxUsers":50,"maxStorageBytes":53687091200,"maxDocuments":10000,"maxOrganizations":3,"maxWorkflows":100,"aiRequestsPerMonth":5000}', CURRENT_TIMESTAMP),
('plan_business', 'business', 'Business', 'Para organizações estabelecidas', 9900, 99000, 'EUR', 1, 3, '["documents","lists","forms","tasks","workflows","approvals","notifications","search","ai_assistant","custom_roles","audit_export","sso","advanced_analytics"]', '{"maxUsers":200,"maxStorageBytes":107374182400,"maxDocuments":100000,"maxOrganizations":10,"maxWorkflows":500,"aiRequestsPerMonth":20000}', CURRENT_TIMESTAMP),
('plan_enterprise', 'enterprise', 'Enterprise', 'Para grandes organizações', 29900, 299000, 'EUR', 1, 4, '["documents","lists","forms","tasks","workflows","approvals","notifications","search","ai_assistant","custom_roles","audit_export","sso","advanced_analytics","dedicated_support","custom_integrations","sla"]', '{"maxUsers":-1,"maxStorageBytes":-1,"maxDocuments":-1,"maxOrganizations":-1,"maxWorkflows":-1,"aiRequestsPerMonth":-1}', CURRENT_TIMESTAMP)
ON CONFLICT("code") DO NOTHING;
