-- DropIndex
DROP INDEX "captured_credentials_eventId_key";

-- CreateIndex
CREATE INDEX "captured_credentials_eventId_idx" ON "captured_credentials"("eventId");
