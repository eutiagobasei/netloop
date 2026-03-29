-- Migration: Remove institutional tag concept
-- Tags are now only for personal organization, clubs use ClubMember for membership (seal)

-- Step 1: Delete all institutional tags (and their associations)
DELETE FROM "contact_tags" WHERE "tagId" IN (
  SELECT id FROM "tags" WHERE "type" = 'INSTITUTIONAL'
);

DELETE FROM "tags" WHERE "type" = 'INSTITUTIONAL';

-- Step 2: Drop the foreign key constraint for clubId
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_clubId_fkey";

-- Step 3: Drop indexes
DROP INDEX IF EXISTS "tags_type_idx";
DROP INDEX IF EXISTS "tags_slug_clubId_key";

-- Step 4: Drop columns
ALTER TABLE "tags" DROP COLUMN IF EXISTS "type";
ALTER TABLE "tags" DROP COLUMN IF EXISTS "clubId";
ALTER TABLE "tags" DROP COLUMN IF EXISTS "isVerified";

-- Step 5: Add unique constraint on slug (now globally unique)
ALTER TABLE "tags" ADD CONSTRAINT "tags_slug_key" UNIQUE ("slug");

-- Step 6: Drop the TagType enum
DROP TYPE IF EXISTS "TagType";
