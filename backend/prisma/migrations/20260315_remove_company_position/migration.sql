-- Migration: Remove company and position fields from contacts
-- Simplifies model focusing on context as the main searchable field

-- Step 1: Concatenate existing company/position data into context (preserve data)
UPDATE contacts
SET context = COALESCE(
  CASE
    WHEN company IS NOT NULL AND position IS NOT NULL AND context IS NOT NULL THEN
      company || ' - ' || position || E'\n\n' || context
    WHEN company IS NOT NULL AND position IS NOT NULL THEN
      company || ' - ' || position
    WHEN company IS NOT NULL AND context IS NOT NULL THEN
      company || E'\n\n' || context
    WHEN position IS NOT NULL AND context IS NOT NULL THEN
      position || E'\n\n' || context
    WHEN company IS NOT NULL THEN
      company
    WHEN position IS NOT NULL THEN
      position
    ELSE
      context
  END,
  context
)
WHERE company IS NOT NULL OR position IS NOT NULL;

-- Step 2: Remove the columns
ALTER TABLE contacts DROP COLUMN IF EXISTS company;
ALTER TABLE contacts DROP COLUMN IF EXISTS position;

-- Step 3: Mark embeddings as needing regeneration by setting them to NULL
-- This ensures all contacts get fresh embeddings based on new context
UPDATE contacts SET embedding = NULL WHERE embedding IS NOT NULL;

-- Note: After running this migration, execute regenerate-embeddings script to update all embeddings
