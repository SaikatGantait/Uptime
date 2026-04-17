-- DropIndex
DROP INDEX IF EXISTS "AlertDelivery_incidentId_idx";

-- DropIndex
DROP INDEX IF EXISTS "AlertRoute_websiteId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Incident_websiteId_status_idx";

-- DropIndex
DROP INDEX IF EXISTS "IncidentEvent_incidentId_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "IntegrationChannel_websiteId_idx";

-- DropIndex
DROP INDEX IF EXISTS "OnCallSchedule_websiteId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Website_statusPageSlug_idx";

-- DropIndex
DROP INDEX IF EXISTS "WebsiteTick_websiteId_createdAt_idx";
