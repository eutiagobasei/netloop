# Migration: Remove Company/Position Fields

## Completed Changes

### 1. Prisma Schema (`prisma/schema.prisma`)
- Removed `company` and `position` fields from Contact model

### 2. Migration SQL (`prisma/migrations/20260315_remove_company_position/migration.sql`)
- Concatenates existing company/position into context field (preserves data)
- Drops company and position columns
- Sets embeddings to NULL (triggers regeneration)

### 3. DTOs
- `create-contact.dto.ts` - Removed company/position fields
- `extracted-contact.dto.ts` - Removed company/position from interface

### 4. Embedding Service (`ai/services/embedding.service.ts`)
- Simplified to use only: name + context + notes + location
- Updated `searchSimilarContacts` query (removed company/position)

### 5. Contacts Service (`contacts/contacts.service.ts`)
- Updated `ContactWithSimilarity` interface
- Removed `searchByCompanyKeywords()` method
- Updated `searchByTextForService()` to search context/notes/name only
- Updated `searchByText()` to use context instead of company/position
- Updated `semanticSearchContacts()` query
- Updated `formatDirectMessage()` - removed company/position display
- Updated `mergeContactData()` - removed company/position
- Updated `formatContactResponse()` - removed company/position
- Updated embedding generation to use simplified fields

## Remaining Changes (TODO)

### 6. Extraction Service (`ai/services/extraction.service.ts`)
Update `extractTagsFromContext` method signature - remove company/position params

### 7. WhatsApp Service (`whatsapp/whatsapp.service.ts`)
Files to update:
- `sendUpdatePrompt()` - Remove company/position display
- `handleUpdateResponse()` - Remove company/position from updateData
- `sendServiceProviderResponse()` - Remove company/position display
- `formatContactSummary()` - Remove company/position display
- `createContactAndConnection()` - Remove company/position from create

### 8. Default Prompts (`ai/constants/default-prompts.ts`)
Update prompts:
- `contact_extraction` - Remove company/position from CAMPOS A EXTRAIR
- `save_confirmation` - Remove company/position placeholders
- `tag_extraction` - Remove company/position from input

### 9. Post-Migration Script
Run after deploying:
```bash
# Regenerate all embeddings
curl -X POST http://localhost:3000/api/admin/regenerate-embeddings
```

## Testing Checklist
- [ ] Run migration on dev database
- [ ] Verify company/position data preserved in context
- [ ] Test search by "tortas para festa" (should find via context)
- [ ] Test contact creation via WhatsApp
- [ ] Test contact update via WhatsApp
- [ ] Regenerate embeddings
- [ ] Deploy to production
