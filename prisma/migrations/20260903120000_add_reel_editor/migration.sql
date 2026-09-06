-- CreateTable
CREATE TABLE "VideoTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ProcessingJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VideoTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcessedVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "outputFilename" TEXT,
    "outputPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "addedToQueue" BOOLEAN NOT NULL DEFAULT false,
    "queuedVideoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "ProcessedVideo_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProcessingJob" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProcessedVideo_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VideoTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EditorSourceVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "thumbnail" TEXT,
    "duration" REAL,
    "size" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
