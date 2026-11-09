-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'ENUM');

-- CreateEnum
CREATE TYPE "SegmentCondition" AS ENUM ('EMAIL_OPENED', 'LINK_CLICKED', 'FORM_SUBMITTED', 'NOT_OPENED');

-- AlterEnum
ALTER TYPE "CampaignEventType" ADD VALUE 'REPORTED_PHISHING';

-- AlterTable
ALTER TABLE "campaign_targets" ADD COLUMN     "sourceCampaignId" TEXT,
ADD COLUMN     "sourceKind" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "customFields" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "parentGroupId" TEXT;

-- AlterTable
ALTER TABLE "landing_pages" ADD COLUMN     "screenshotPath" TEXT;

-- CreateTable
CREATE TABLE "custom_field_defs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "defaultValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_defs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_defs_key_key" ON "custom_field_defs"("key");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
