-- Add Meta WhatsApp Cloud API settings
-- Provider selection: 'meta' (primary) or 'evolution' (fallback)

INSERT INTO "system_settings" ("id", "key", "value", "category", "isEncrypted", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'whatsapp_provider', 'evolution', 'WHATSAPP', false, 'WhatsApp provider: meta (oficial) ou evolution (fallback)', NOW(), NOW()),
  (gen_random_uuid(), 'meta_phone_number_id', '', 'WHATSAPP', true, 'ID do número de telefone no Meta Business', NOW(), NOW()),
  (gen_random_uuid(), 'meta_access_token', '', 'WHATSAPP', true, 'Token de acesso Bearer para Meta Cloud API', NOW(), NOW()),
  (gen_random_uuid(), 'meta_api_version', 'v23.0', 'WHATSAPP', false, 'Versão da API do Meta (ex: v23.0)', NOW(), NOW()),
  (gen_random_uuid(), 'meta_verify_token', '', 'WHATSAPP', true, 'Token para verificação do webhook Meta', NOW(), NOW()),
  (gen_random_uuid(), 'meta_business_account_id', '', 'WHATSAPP', false, 'ID da conta Business no Meta (opcional)', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
