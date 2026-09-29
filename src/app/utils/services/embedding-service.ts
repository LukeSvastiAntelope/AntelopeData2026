/**
 * Text embeddings without OpenAI.
 *
 * Produces a deterministic 1536-d unit vector from SHA-256 of the input so
 * Pinecone upsert/query paths keep working after the Anthropic-only LLM
 * migration. Semantic quality is weaker than a dedicated embedding model —
 * swap this implementation when a non-OpenAI embedder is wired up.
 */

import { createHash } from 'crypto';

export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL_ID = 'local-sha256-v1';

function hashToUnitVector(text: string, dims = EMBEDDING_DIMENSIONS): number[] {
  const vec = new Array<number>(dims).fill(0);
  const normalized = String(text || '').trim() || ' ';
  // Expand entropy across the vector by hashing sliding chunks.
  for (let i = 0; i < dims; i += 32) {
    const h = createHash('sha256')
      .update(`${normalized}\0${i}`)
      .digest();
    for (let j = 0; j < 32 && i + j < dims; j++) {
      // Map byte → [-1, 1]
      vec[i + j] = h[j] / 127.5 - 1;
    }
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export async function embedText(text: string): Promise<{
  model: string;
  vector: number[];
}> {
  return {
    model: process.env.MEMORY_EMBEDDING_MODEL?.trim() || EMBEDDING_MODEL_ID,
    vector: hashToUnitVector(text),
  };
}
