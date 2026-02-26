-- AlterTable
ALTER TABLE "Website" ADD COLUMN "checkType" TEXT NOT NULL DEFAULT 'HTTP';
ALTER TABLE "Website" ADD COLUMN "expectedKeyword" TEXT;
ALTER TABLE "Website" ADD COLUMN "dnsRecordType" TEXT;
ALTER TABLE "Website" ADD COLUMN "dnsExpectedValue" TEXT;
ALTER TABLE "Website" ADD COLUMN "tlsWarningDaysCsv" TEXT NOT NULL DEFAULT '30,14,7';
ALTER TABLE "Website" ADD COLUMN "multiStepConfig" TEXT;
ALTER TABLE "Website" ADD COLUMN "sloTarget" REAL NOT NULL DEFAULT 99.9;
ALTER TABLE "Website" ADD COLUMN "errorBudgetWindowMinutes" INTEGER NOT NULL DEFAULT 43200;
ALTER TABLE "Website" ADD COLUMN "teamName" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "WebsiteTick" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'P3';
ALTER TABLE "WebsiteTick" ADD COLUMN "details" TEXT;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'P3';

-- CreateTable
CREATE TABLE "AlertRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "targetTeam" TEXT NOT NULL,
    "minSeverity" TEXT NOT NULL DEFAULT 'P3',
    "channel" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertRoute_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OnCallSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "rotationName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnCallSchedule_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationChannel_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertDelivery_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "AlertRoute_websiteId_idx" ON "AlertRoute"("websiteId");
CREATE INDEX "OnCallSchedule_websiteId_idx" ON "OnCallSchedule"("websiteId");
CREATE INDEX "IntegrationChannel_websiteId_idx" ON "IntegrationChannel"("websiteId");
CREATE INDEX "AlertDelivery_incidentId_idx" ON "AlertDelivery"("incidentId");
CREATE INDEX "WebsiteTick_websiteId_createdAt_idx" ON "WebsiteTick"("websiteId", "createdAt");
