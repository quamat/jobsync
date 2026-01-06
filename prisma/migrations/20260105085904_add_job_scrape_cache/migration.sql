-- CreateTable
CREATE TABLE "JobScrapeCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "apifyRunId" TEXT,
    "datasetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "JobScrapeCache_url_key" ON "JobScrapeCache"("url");
