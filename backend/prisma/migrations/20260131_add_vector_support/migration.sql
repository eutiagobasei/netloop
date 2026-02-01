-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for similarity search
CREATE INDEX IF NOT EXISTS contacts_embedding_idx ON contacts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Add extracted_data column to whatsapp_messages for storing AI extracted data
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS extracted_data JSONB;
