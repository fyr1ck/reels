-- CreateTable
CREATE TABLE "UserSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "defaultCaption" TEXT NOT NULL DEFAULT '🚀 Transforme sua presença digital. Confira o link da bio!',
    "useDefaultCaption" BOOLEAN NOT NULL DEFAULT true,
    "postsPerDay" INTEGER NOT NULL DEFAULT 5,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "automationStatus" TEXT NOT NULL DEFAULT 'PAUSED',
    "keepBrowserOpen" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "thumbnail" TEXT,
    "duration" REAL,
    "size" INTEGER,
    "caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "failedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Publication_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "time" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "video" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT,
    "attempt" INTEGER,
    "durationMs" INTEGER
);
