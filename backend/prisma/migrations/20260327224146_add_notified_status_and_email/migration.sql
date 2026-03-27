-- AlterEnum
ALTER TYPE "InviteStatus" ADD VALUE 'NOTIFIED';

-- DropIndex
DROP INDEX "connections_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "contacts_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "contacts_name_trgm_idx";

-- DropIndex
DROP INDEX "contacts_owner_name_idx";

-- DropIndex
DROP INDEX "mentioned_connections_name_trgm_idx";

-- AlterTable
ALTER TABLE "group_invites" ADD COLUMN     "email" TEXT;
