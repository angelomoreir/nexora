-- CreateTable: AIConversation
CREATE TABLE IF NOT EXISTS "AIConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "AIConversation_tenantId_userId_idx" ON "AIConversation"("tenantId", "userId");

-- CreateTable: AIMessage
CREATE TABLE IF NOT EXISTS "AIMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actionType" TEXT,
    "actionData" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");

-- CreateTable: AIOperation
CREATE TABLE IF NOT EXISTS "AIOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "model" TEXT NOT NULL DEFAULT 'rule-based',
    "tokensInput" INTEGER NOT NULL DEFAULT 0,
    "tokensOutput" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AIOperation_tenantId_createdAt_idx" ON "AIOperation"("tenantId", "createdAt");
