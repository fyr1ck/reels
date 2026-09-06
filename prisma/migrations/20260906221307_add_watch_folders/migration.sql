-- CreateTable
CREATE TABLE "WatchFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "importMode" TEXT NOT NULL DEFAULT 'COPY',
    "autoCaption" BOOLEAN NOT NULL DEFAULT false,
    "lastScanAt" DATETIME,
    "lastError" TEXT,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "watchFolderId" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mtimeMs" REAL NOT NULL,
    "videoId" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportedFile_watchFolderId_fkey" FOREIGN KEY ("watchFolderId") REFERENCES "WatchFolder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchFolder_path_key" ON "WatchFolder"("path");

-- CreateIndex
CREATE INDEX "ImportedFile_watchFolderId_idx" ON "ImportedFile"("watchFolderId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedFile_watchFolderId_sourcePath_size_mtimeMs_key" ON "ImportedFile"("watchFolderId", "sourcePath", "size", "mtimeMs");
