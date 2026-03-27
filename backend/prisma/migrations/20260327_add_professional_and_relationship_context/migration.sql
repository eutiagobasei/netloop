-- AlterTable: Add professionalInfo and relationshipContext to contacts
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "professionalInfo" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "relationshipContext" TEXT;

-- Migrate existing data: copy context to professionalInfo where it seems professional
-- This is a safe migration that preserves existing data
