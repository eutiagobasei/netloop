-- ==============================================================
-- Performance Optimization: HNSW Index + pg_trgm for Fuzzy Search
-- ==============================================================

-- Enable pg_trgm extension for fuzzy text search (similarity function)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing IVFFlat index (less efficient for our use case)
DROP INDEX IF EXISTS contacts_embedding_idx;

-- Create HNSW index for vector similarity search (10-100x faster than IVFFlat)
-- HNSW (Hierarchical Navigable Small World) is better for:
-- - Smaller datasets (<1M vectors)
-- - Frequent inserts/updates
-- - Lower latency queries
CREATE INDEX IF NOT EXISTS contacts_embedding_hnsw_idx
  ON contacts USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Create HNSW index for connections table
DROP INDEX IF EXISTS connections_embedding_idx;
CREATE INDEX IF NOT EXISTS connections_embedding_hnsw_idx
  ON connections USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Create trigram index on contacts.name for fuzzy search
-- This allows fast similarity() queries without loading all contacts
CREATE INDEX IF NOT EXISTS contacts_name_trgm_idx
  ON contacts USING gin (name gin_trgm_ops);

-- Create trigram index on mentioned_connections.name for bridge searches
CREATE INDEX IF NOT EXISTS mentioned_connections_name_trgm_idx
  ON mentioned_connections USING gin (name gin_trgm_ops);

-- Create composite index for ownerId + name searches
CREATE INDEX IF NOT EXISTS contacts_owner_name_idx
  ON contacts ("ownerId", name);

-- Analyze tables to update statistics for query planner
ANALYZE contacts;
ANALYZE connections;
ANALYZE mentioned_connections;
