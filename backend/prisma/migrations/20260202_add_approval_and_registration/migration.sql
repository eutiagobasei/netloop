-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'AWAITING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');

-- CreateEnum
CREATE TYPE "RegistrationStep" AS ENUM ('WELCOME_SENT', 'AWAITING_NAME', 'AWAITING_EMAIL', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('AUDIO', 'VIDEO', 'IMAGE');

-- AlterTable: Add new columns to whatsapp_messages
ALTER TABLE "whatsapp_messages" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "whatsapp_messages" ADD COLUMN "approvalSentAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN "contactCreated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "whatsapp_messages_approvalStatus_idx" ON "whatsapp_messages"("approvalStatus");

-- CreateTable: user_registration_flows
CREATE TABLE "user_registration_flows" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "step" "RegistrationStep" NOT NULL DEFAULT 'WELCOME_SENT',
    "name" TEXT,
    "email" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_registration_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_registration_flows_phone_key" ON "user_registration_flows"("phone");

-- CreateIndex
CREATE INDEX "user_registration_flows_phone_idx" ON "user_registration_flows"("phone");

-- CreateIndex
CREATE INDEX "user_registration_flows_step_idx" ON "user_registration_flows"("step");

-- CreateTable: media_uploads
CREATE TABLE "media_uploads" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" "MediaType" NOT NULL,
    "settingKey" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_uploads_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
