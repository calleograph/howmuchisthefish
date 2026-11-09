-- AlterTable
ALTER TABLE "landing_pages" ADD COLUMN     "capturesCredentials" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "captured_credentials" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "captured_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "captured_credentials_eventId_key" ON "captured_credentials"("eventId");

-- AddForeignKey
ALTER TABLE "captured_credentials" ADD CONSTRAINT "captured_credentials_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "campaign_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
