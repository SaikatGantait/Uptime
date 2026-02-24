-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Validator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicKey" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "pendingPayouts" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "WebsiteTick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteId" TEXT NOT NULL,
    "validatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "latency" REAL NOT NULL,
    CONSTRAINT "WebsiteTick_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WebsiteTick_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "Validator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
