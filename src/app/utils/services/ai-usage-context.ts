/**
 * AsyncLocalStorage context so the AI gateway can attribute usage to an org
 * without every leaf call site passing orgId.
 */

import { AsyncLocalStorage } from 'async_hooks';

export type AiUsageContext = {
  organizationId?: number | null;
  userId?: number | null;
  feature?: string;
};

const als = new AsyncLocalStorage<AiUsageContext>();

export function getAiUsageContext(): AiUsageContext {
  return als.getStore() || {};
}

export function runWithAiUsageContext<T>(
  ctx: AiUsageContext,
  fn: () => T
): T {
  const parent = als.getStore() || {};
  return als.run({ ...parent, ...ctx }, fn);
}

export async function runWithAiUsageContextAsync<T>(
  ctx: AiUsageContext,
  fn: () => Promise<T>
): Promise<T> {
  const parent = als.getStore() || {};
  return als.run({ ...parent, ...ctx }, fn);
}
