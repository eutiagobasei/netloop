-- Adiciona coluna de embedding para busca semântica em conexões
ALTER TABLE "connections" ADD COLUMN "embedding" vector(1536);

-- Índice para busca por similaridade usando IVFFlat
CREATE INDEX connections_embedding_idx
  ON connections USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
