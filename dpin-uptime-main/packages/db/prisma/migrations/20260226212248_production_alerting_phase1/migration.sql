-- AlterTable
ALTER TABLE "Website" ADD COLUMN "maintenanceEndAt" DATETIME;
ALTER TABLE "Website" ADD COLUMN "maintenanceStartAt" DATETIME;
ALTER TABLE "Website" ADD COLUMN "snoozeUntil" DATETIME;
ALTER TABLE "Website" ADD COLUMN "statusPageBrandColor" TEXT;
ALTER TABLE "Website" ADD COLUMN "statusPageLogoUrl" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AlertDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notificationKind" TEXT NOT NULL DEFAULT 'FIRE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "lastError" TEXT,
    "externalId" TEXT,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertDelivery_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AlertDelivery" ("channelType", "createdAt", "destination", "id", "incidentId", "status") SELECT "channelType", "createdAt", "destination", "id", "incidentId", "status" FROM "AlertDelivery";
DROP TABLE "AlertDelivery";
ALTER TABLE "new_AlertDelivery" RENAME TO "AlertDelivery";
CREATE TABLE "new_AlertRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "targetTeam" TEXT NOT NULL,
    "escalationTargetTeam" TEXT,
    "escalationAfterMinutes" INTEGER NOT NULL DEFAULT 10,
    "minSeverity" TEXT NOT NULL DEFAULT 'P3',
    "channel" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertRoute_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AlertRoute" ("channel", "createdAt", "id", "minSeverity", "targetTeam", "websiteId") SELECT "channel", "createdAt", "id", "minSeverity", "targetTeam", "websiteId" FROM "AlertRoute";
DROP TABLE "AlertRoute";
ALTER TABLE "new_AlertRoute" RENAME TO "AlertRoute";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
