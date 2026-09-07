import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { openSql } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';

export type CampaignMemoryType = 'fact' | 'preference' | 'event' | 'summary';

export interface CampaignMemoryRecord {
  id: number;
  orgId: number | null;
  userId: number | null;
  memoryType: CampaignMemoryType;
  content: string;
  importanceScore: number;
  confidenceScore: number;
}

export interface UpsertCampaignMemoryInput {
  orgId?: number | null;
  userId?: number | null;
  memoryType: CampaignMemoryType;
  content: string;
  importanceScore?: number;
  confidenceScore?: number;
  sourceConversationId?: string;
  sourceMessageId?: string;
}

export interface RetrieveCampaignMemoryInput {
  traceId: string;
  query: string;
  namespace: string;
  topK?: number;
  orgId?: number | null;
  userId?: number | null;
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
  return new OpenAI({ apiKey });
}

function getPineconeIndex() {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) throw new Error('PINECONE_API_KEY is missing');
  const indexName = process.env.PINECONE_MEMORY_INDEX || process.env.PINECONE_INDEX || 'prediction-results';
  return new Pinecone({ apiKey }).index(indexName);
}

async function embedText(text: string) {
  const client = getOpenAIClient();
  const model = process.env.MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small';
  const result = await client.embeddings.create({
    model,
    input: text,
  });
  return {
    model,
    vector: result.data[0]?.embedding || [],
  };
}

export function buildCampaignMemoryNamespace(orgId?: number | null, userId?: number | null) {
  const orgPart = orgId ? `org-${orgId}` : 'org-none';
  const userPart = userId ? `user-${userId}` : 'user-none';
  return `campaign-memory:${orgPart}:${userPart}`;
}

export class CampaignMemoryService {
  static async upsertMemory(input: UpsertCampaignMemoryInput) {
    const db = await openSql();
    const [insertResult]: any = await db.execute(
      `INSERT INTO campaign_memory_items
       (org_id, user_id, memory_type, content, importance_score, confidence_score, source_conversation_id, source_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.orgId || null,
        input.userId || null,
        input.memoryType,
        input.content,
        input.importanceScore ?? 0.5,
        input.confidenceScore ?? 0.5,
        input.sourceConversationId || null,
        input.sourceMessageId || null,
      ]
    );

    const memoryId = Number(insertResult.insertId);
    const namespace = buildCampaignMemoryNamespace(input.orgId, input.userId);
    const { model, vector } = await embedText(input.content);
    const pineconeId = `memory-${memoryId}`;

    const index = getPineconeIndex();
    await index.namespace(namespace).upsert([
      {
        id: pineconeId,
        values: vector,
        metadata: {
          memoryId,
          orgId: input.orgId || null,
          userId: input.userId || null,
          memoryType: input.memoryType,
          importanceScore: input.importanceScore ?? 0.5,
          confidenceScore: input.confidenceScore ?? 0.5,
        },
      },
    ]);

    await db.execute(
      `INSERT INTO campaign_memory_embeddings
       (memory_item_id, pinecone_id, pinecone_namespace, embedding_model)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         pinecone_id = VALUES(pinecone_id),
         pinecone_namespace = VALUES(pinecone_namespace),
         embedding_model = VALUES(embedding_model)`,
      [memoryId, pineconeId, namespace, model]
    );

    return { memoryId, pineconeId, namespace };
  }

  static async retrieveRelevantMemories(input: RetrieveCampaignMemoryInput): Promise<CampaignMemoryRecord[]> {
    const topK = Math.max(1, Math.min(20, Number(input.topK) || 8));
    const { vector } = await embedText(input.query);
    const index = getPineconeIndex();

    const result = await index.namespace(input.namespace).query({
      vector,
      topK,
      includeMetadata: true,
    });

    const memoryIds = (result.matches || [])
      .map((m: any) => Number(m.metadata?.memoryId))
      .filter((id: number) => Number.isFinite(id));

    if (!memoryIds.length) return [];

    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id,
              org_id AS orgId,
              user_id AS userId,
              memory_type AS memoryType,
              content,
              importance_score AS importanceScore,
              confidence_score AS confidenceScore
       FROM campaign_memory_items
       WHERE id IN (${memoryIds.map(() => '?').join(',')})`,
      memoryIds
    );

    await db.execute(
      `INSERT INTO campaign_memory_retrieval_logs
       (trace_id, org_id, user_id, query_text, retrieval_namespace, top_k, retrieved_memory_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.traceId,
        input.orgId || null,
        input.userId || null,
        input.query,
        input.namespace,
        topK,
        JSON.stringify(memoryIds),
      ]
    );

    return rows as unknown as CampaignMemoryRecord[];
  }
}
