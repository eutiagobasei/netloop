/*
  Warnings:

  - You are about to drop the column `extracted_data` on the `whatsapp_messages` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MembersVisibility" AS ENUM ('HIDDEN', 'VISIBLE');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'INVITED', 'ACCEPTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "RegistrationStep" ADD VALUE 'CONVERSATION';

-- AlterEnum
ALTER TYPE "SettingCategory" ADD VALUE 'PROMPTS';

-- DropIndex
DROP INDEX "connections_embedding_idx";

-- DropIndex
DROP INDEX "contacts_embedding_idx";

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "color" TEXT DEFAULT '#6366f1',
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "membersVisibility" "MembersVisibility" NOT NULL DEFAULT 'HIDDEN';

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "whatsapp_messages" DROP COLUMN "extracted_data",
ADD COLUMN     "extractedData" JSONB;

-- CreateTable
CREATE TABLE "group_invites" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company" TEXT,
    "companyDescription" TEXT,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_invites_groupId_phone_key" ON "group_invites"("groupId", "phone");

-- AddForeignKey
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
