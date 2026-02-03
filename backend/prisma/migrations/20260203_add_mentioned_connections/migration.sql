-- CreateTable: mentioned_connections
CREATE TABLE "mentioned_connections" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentioned_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mentioned_connections_contactId_idx" ON "mentioned_connections"("contactId");

-- CreateIndex
CREATE INDEX "mentioned_connections_name_idx" ON "mentioned_connections"("name");

-- AddForeignKey
ALTER TABLE "mentioned_connections" ADD CONSTRAINT "mentioned_connections_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
