ALTER TABLE "ContactRequest" ADD COLUMN "intent" TEXT NOT NULL DEFAULT 'contact';
ALTER TABLE "ContactRequest" ADD COLUMN "teamSize" TEXT;
ALTER TABLE "ContactRequest" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "ContactRequest" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ContactRequest" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "ContactRequest_status_idx" ON "ContactRequest"("status");
