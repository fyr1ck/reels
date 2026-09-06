-- AlterTable: UserSettings — limpeza automática de cache
ALTER TABLE "UserSettings" ADD COLUMN "cacheAutoCleanEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "cacheAutoCleanIntervalHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "UserSettings" ADD COLUMN "lastCacheCleanAt" DATETIME;
