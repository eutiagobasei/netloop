-- Adiciona colunas faltantes na tabela user_registration_flows
-- Essas colunas estavam no schema.prisma mas não foram incluídas na migration 20260202
ALTER TABLE "user_registration_flows" ADD COLUMN "conversationHistory" JSONB;
ALTER TABLE "user_registration_flows" ADD COLUMN "extractedData" JSONB;
ALTER TABLE "user_registration_flows" ADD COLUMN "attemptsCount" INTEGER NOT NULL DEFAULT 0;
