-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "label" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "lastConnectedAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "automationStatus" TEXT NOT NULL DEFAULT 'PAUSED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultCaption" TEXT,
    "useDefaultCaption" BOOLEAN NOT NULL DEFAULT true,
    "scheduleMode" TEXT NOT NULL DEFAULT 'TIMES',
    "intervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "randomOrder" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Publication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,
    CONSTRAINT "Publication_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Publication_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Publication" ("attempts", "createdAt", "errorMessage", "id", "publishedAt", "scheduledAt", "status", "videoId") SELECT "attempts", "createdAt", "errorMessage", "id", "publishedAt", "scheduledAt", "status", "videoId" FROM "Publication";
DROP TABLE "Publication";
ALTER TABLE "new_Publication" RENAME TO "Publication";
CREATE INDEX "Publication_accountId_idx" ON "Publication"("accountId");
CREATE TABLE "new_Schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "time" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "accountId" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'REEL',
    "jitterMinutes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Schedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("enabled", "id", "jitterMinutes", "time") SELECT "enabled", "id", "jitterMinutes", "time" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "thumbnail" TEXT,
    "duration" REAL,
    "size" INTEGER,
    "caption" TEXT,
    "coverPath" TEXT,
    "coverEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "failedAt" DATETIME,
    "accountId" TEXT,
    "mediaType" TEXT NOT NULL DEFAULT 'REEL',
    CONSTRAINT "Video_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("caption", "coverEnabled", "coverPath", "createdAt", "duration", "failedAt", "filename", "filepath", "id", "position", "publishedAt", "size", "status", "thumbnail") SELECT "caption", "coverEnabled", "coverPath", "createdAt", "duration", "failedAt", "filename", "filepath", "id", "position", "publishedAt", "size", "status", "thumbnail" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE INDEX "Video_accountId_idx" ON "Video"("accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- ============================================================
-- MIGRACAO DE DADOS: adota o estado single-conta como "conta padrao"
-- ============================================================
-- Tudo que existia antes do multi-conta pertencia implicitamente a uma unica
-- conta. Em vez de deixar accountId null e obrigar todo query a carregar um
-- "OR accountId IS NULL", cria-se uma conta padrao concreta e as linhas
-- existentes passam a apontar para ela. O id e fixo para a migracao ser
-- deterministica (mesmo resultado em qualquer maquina).

INSERT INTO "Account" (
  "id", "username", "label", "connected", "active", "automationStatus",
  "isDefault", "useDefaultCaption", "scheduleMode", "intervalMinutes",
  "randomOrder", "position", "createdAt", "updatedAt"
)
SELECT
  '00000000-0000-4000-8000-000000000001',
  'conta-principal',
  'Conta principal',
  0, 1, 'PAUSED', 1, 1, 'TIMES', 5, 0, 0,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP;

UPDATE "Video"       SET "accountId" = '00000000-0000-4000-8000-000000000001' WHERE "accountId" IS NULL;
UPDATE "Publication" SET "accountId" = '00000000-0000-4000-8000-000000000001' WHERE "accountId" IS NULL;
UPDATE "Schedule"    SET "accountId" = '00000000-0000-4000-8000-000000000001' WHERE "accountId" IS NULL;

-- Herda as preferencias globais que agora passam a ser por conta.
UPDATE "Account"
SET "defaultCaption"    = (SELECT "defaultCaption"    FROM "UserSettings" WHERE "id" = 1),
    "useDefaultCaption" = (SELECT "useDefaultCaption" FROM "UserSettings" WHERE "id" = 1),
    "scheduleMode"      = (SELECT "scheduleMode"      FROM "UserSettings" WHERE "id" = 1),
    "intervalMinutes"   = (SELECT "intervalMinutes"   FROM "UserSettings" WHERE "id" = 1),
    "automationStatus"  = (SELECT "automationStatus"  FROM "UserSettings" WHERE "id" = 1)
WHERE "id" = '00000000-0000-4000-8000-000000000001'
  AND EXISTS (SELECT 1 FROM "UserSettings" WHERE "id" = 1);
