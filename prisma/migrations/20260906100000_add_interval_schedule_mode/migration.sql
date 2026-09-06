-- AlterTable: UserSettings — modo de agendamento por intervalo ("a cada X minutos")
ALTER TABLE "UserSettings" ADD COLUMN "scheduleMode" TEXT NOT NULL DEFAULT 'TIMES';
ALTER TABLE "UserSettings" ADD COLUMN "intervalMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "UserSettings" ADD COLUMN "intervalStartMode" TEXT NOT NULL DEFAULT 'NOW';
ALTER TABLE "UserSettings" ADD COLUMN "intervalStartAt" TEXT;
