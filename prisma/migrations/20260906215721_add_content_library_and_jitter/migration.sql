-- CreateTable
CREATE TABLE "CaptionTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HashtagGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hashtags" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
-- ADD COLUMN em vez de recriar a tabela: preserva os horarios ja cadastrados,
-- o AUTOINCREMENT e qualquer linha existente. Default 0 = jitter desligado,
-- ou seja, o agendamento continua se comportando exatamente como antes.
ALTER TABLE "Schedule" ADD COLUMN "jitterMinutes" INTEGER NOT NULL DEFAULT 0;
