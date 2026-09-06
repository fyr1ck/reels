-- AlterTable: Video — capa individual do vídeo
ALTER TABLE "Video" ADD COLUMN "coverPath" TEXT;
ALTER TABLE "Video" ADD COLUMN "coverEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: UserSettings — capa padrão para novos vídeos
ALTER TABLE "UserSettings" ADD COLUMN "defaultCoverPath" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "useDefaultCover" BOOLEAN NOT NULL DEFAULT false;
