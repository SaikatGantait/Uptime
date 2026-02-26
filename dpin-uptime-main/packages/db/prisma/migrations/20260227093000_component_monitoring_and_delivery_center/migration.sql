-- CreateTable
CREATE TABLE "WebsiteComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetUrl" TEXT,
    "path" TEXT,
    "checkType" TEXT NOT NULL DEFAULT 'HTTP',
    "expectedKeyword" TEXT,
    "dnsRecordType" TEXT,
    "dnsExpectedValue" TEXT,
    "tlsWarningDaysCsv" TEXT,
    "multiStepConfig" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteComponent_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComponentTick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "validatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "latency" REAL NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'P3',
    "details" TEXT,
    CONSTRAINT "ComponentTick_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComponentTick_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "WebsiteComponent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComponentTick_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "Validator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WebsiteComponent_websiteId_createdAt_idx" ON "WebsiteComponent"("websiteId", "createdAt");

-- CreateIndex
CREATE INDEX "ComponentTick_componentId_createdAt_idx" ON "ComponentTick"("componentId", "createdAt");

-- CreateIndex
CREATE INDEX "ComponentTick_websiteId_createdAt_idx" ON "ComponentTick"("websiteId", "createdAt");
