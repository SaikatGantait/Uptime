-- AlterTable
ALTER TABLE "Website" ADD COLUMN "cooldownMinutes" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Website" ADD COLUMN "retries" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Website" ADD COLUMN "quorum" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Website" ADD COLUMN "validatorsPerRound" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Website" ADD COLUMN "escalationMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Website" ADD COLUMN "statusPageSlug" TEXT;
ALTER TABLE "Website" ADD COLUMN "statusPagePublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Website" ADD COLUMN "statusPageTitle" TEXT NOT NULL DEFAULT 'Service Status';
ALTER TABLE "Website" ADD COLUMN "lastAlertSentAt" DATETIME;

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "escalatedAt" DATETIME,
    "summary" TEXT,
    "postmortemTemplate" TEXT,
    CONSTRAINT "Incident_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncidentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    CONSTRAINT "IncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Incident_websiteId_status_idx" ON "Incident"("websiteId", "status");
CREATE INDEX "Website_statusPageSlug_idx" ON "Website"("statusPageSlug");
CREATE INDEX "IncidentEvent_incidentId_createdAt_idx" ON "IncidentEvent"("incidentId", "createdAt");
