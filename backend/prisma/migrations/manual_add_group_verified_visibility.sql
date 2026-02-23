-- Migration: Add Group Verified/Visibility Fields
-- Description: Adds isVerified, color, membersVisibility to Group model
--              Adds isVerified to Tag model
--              Adds MembersVisibility enum

-- Create the MembersVisibility enum
DO $$ BEGIN
    CREATE TYPE "MembersVisibility" AS ENUM ('HIDDEN', 'VISIBLE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to groups table
ALTER TABLE "groups"
ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "color" VARCHAR(255) DEFAULT '#6366f1',
ADD COLUMN IF NOT EXISTS "membersVisibility" "MembersVisibility" NOT NULL DEFAULT 'HIDDEN';

-- Add isVerified column to tags table
ALTER TABLE "tags"
ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;

-- Update existing institutional tags to inherit isVerified from their groups
UPDATE "tags" t
SET "isVerified" = g."isVerified"
FROM "groups" g
WHERE t."groupId" = g.id
AND t.type = 'INSTITUTIONAL';

-- Comments for documentation
COMMENT ON COLUMN "groups"."isVerified" IS 'Indicates if the group is officially verified/sponsored';
COMMENT ON COLUMN "groups"."color" IS 'Primary color for the group''s institutional tag';
COMMENT ON COLUMN "groups"."membersVisibility" IS 'Controls whether members can see each other''s contacts (v2 feature)';
COMMENT ON COLUMN "tags"."isVerified" IS 'Indicates if the tag is verified (inherited from group for institutional tags)';
