import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly prisma: PrismaService,
  ) {}

  async generateEmbedding(text: string): Promise<number[]> {
    this.logger.log(`Gerando embedding para: ${text.substring(0, 50)}...`);

    const client = await this.openaiService.getClient();

    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0].embedding;
  }

  async updateContactEmbedding(contactId: string): Promise<void> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      throw new Error('Contato não encontrado');
    }

    // Monta o texto para embedding
    const textParts = [
      contact.name,
      contact.company,
      contact.position,
      contact.location,
      contact.context,
      contact.notes,
    ].filter(Boolean);

    if (textParts.length === 0) {
      this.logger.warn(`Contato ${contactId} não tem dados suficientes para embedding`);
      return;
    }

    const text = textParts.join(' ');
    const embedding = await this.generateEmbedding(text);

    // Atualiza o embedding usando SQL raw (Prisma não suporta vector nativamente)
    await this.prisma.$executeRawUnsafe(
      `UPDATE contacts SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(',')}]`,
      contactId,
    );

    this.logger.log(`Embedding atualizado para contato ${contactId}`);
  }

  async searchSimilarContacts(
    query: string,
    userId: string,
    limit = 10,
  ): Promise<any[]> {
    this.logger.log(`Busca semântica: "${query}" para usuário ${userId}`);

    const embedding = await this.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    // Busca por similaridade usando pgvector
    const results = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        id,
        name,
        company,
        position,
        location,
        context,
        phone,
        email,
        1 - (embedding <=> $1::vector) as similarity
      FROM contacts
      WHERE owner_id = $2
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      embeddingStr,
      userId,
      limit,
    );

    this.logger.log(`Encontrados ${results.length} contatos similares`);

    return results;
  }

  async updateConnectionEmbedding(connectionId: string): Promise<void> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
      include: { contact: true },
    });

    if (!connection) {
      throw new Error('Conexão não encontrada');
    }

    if (!connection.context) {
      this.logger.warn(`Conexão ${connectionId} não tem contexto para embedding`);
      return;
    }

    // Monta o texto para embedding: nome do contato + contexto da conexão
    const text = `${connection.contact.name} - ${connection.context}`;
    const embedding = await this.generateEmbedding(text);

    // Atualiza o embedding usando SQL raw (Prisma não suporta vector nativamente)
    await this.prisma.$executeRawUnsafe(
      `UPDATE connections SET embedding = $1::vector WHERE id = $2`,
      `[${embedding.join(',')}]`,
      connectionId,
    );

    this.logger.log(`Embedding atualizado para conexão ${connectionId}`);
  }

  async searchSimilarConnections(
    query: string,
    userId: string,
    limit = 10,
  ): Promise<any[]> {
    this.logger.log(`Busca semântica de conexões: "${query}" para usuário ${userId}`);

    const embedding = await this.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    // Busca por similaridade usando pgvector
    const results = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        conn.id,
        conn.context,
        conn.strength,
        conn.created_at as "createdAt",
        c.id as "contactId",
        c.name as "contactName",
        c.company as "contactCompany",
        c.position as "contactPosition",
        c.phone as "contactPhone",
        c.email as "contactEmail",
        1 - (conn.embedding <=> $1::vector) as similarity
      FROM connections conn
      INNER JOIN contacts c ON conn.contact_id = c.id
      WHERE conn.from_user_id = $2
        AND conn.embedding IS NOT NULL
      ORDER BY conn.embedding <=> $1::vector
      LIMIT $3
      `,
      embeddingStr,
      userId,
      limit,
    );

    this.logger.log(`Encontradas ${results.length} conexões similares`);

    return results;
  }

  async backfillConnectionEmbeddings(userId?: string): Promise<{ processed: number; skipped: number }> {
    this.logger.log(`Iniciando backfill de embeddings de conexões${userId ? ` para usuário ${userId}` : ''}`);

    const whereClause = userId ? `AND conn.from_user_id = '${userId}'` : '';

    // Busca conexões com contexto mas sem embedding
    const connections = await this.prisma.$queryRawUnsafe<{ id: string; context: string; contactName: string }[]>(
      `
      SELECT conn.id, conn.context, c.name as "contactName"
      FROM connections conn
      INNER JOIN contacts c ON conn.contact_id = c.id
      WHERE conn.context IS NOT NULL
        AND conn.embedding IS NULL
        ${whereClause}
      `,
    );

    let processed = 0;
    let skipped = 0;

    for (const conn of connections) {
      try {
        const text = `${conn.contactName} - ${conn.context}`;
        const embedding = await this.generateEmbedding(text);

        await this.prisma.$executeRawUnsafe(
          `UPDATE connections SET embedding = $1::vector WHERE id = $2`,
          `[${embedding.join(',')}]`,
          conn.id,
        );

        processed++;
        this.logger.log(`Embedding gerado para conexão ${conn.id} (${processed}/${connections.length})`);
      } catch (error) {
        skipped++;
        this.logger.error(`Erro ao gerar embedding para conexão ${conn.id}: ${error.message}`);
      }
    }

    this.logger.log(`Backfill concluído: ${processed} processados, ${skipped} ignorados`);
    return { processed, skipped };
  }
}
