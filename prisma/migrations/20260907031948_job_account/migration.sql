-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProcessingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalVideos" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledCount" INTEGER NOT NULL DEFAULT 0,
    "concurrency" INTEGER NOT NULL DEFAULT 2,
    "autoQueue" BOOLEAN NOT NULL DEFAULT false,
    "autoSchedule" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'REEL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ProcessingJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VideoTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProcessingJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProcessingJob" ("autoQueue", "autoSchedule", "cancelledCount", "completedCount", "concurrency", "createdAt", "failedCount", "finishedAt", "id", "status", "templateId", "totalVideos") SELECT "autoQueue", "autoSchedule", "cancelledCount", "completedCount", "concurrency", "createdAt", "failedCount", "finishedAt", "id", "status", "templateId", "totalVideos" FROM "ProcessingJob";
DROP TABLE "ProcessingJob";
ALTER TABLE "new_ProcessingJob" RENAME TO "ProcessingJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
