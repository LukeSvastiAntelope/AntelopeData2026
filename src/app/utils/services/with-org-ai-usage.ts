import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { runWithAiUsageContextAsync } from '@/app/utils/services/ai-usage-context';

/**
 * Attribute AI gateway metering to the caller's primary org for the duration
 * of `fn`. Safe no-op when userId is missing.
 */
export async function withUserOrgAiUsage<T>(
  userId: string | number | null | undefined,
  feature: string,
  fn: () => Promise<T>
): Promise<T> {
  if (userId == null || userId === '') {
    return runWithAiUsageContextAsync({ feature }, fn);
  }
  const uid = Number(userId);
  try {
    const organizationId = await ensurePrimaryOrgId(uid);
    return runWithAiUsageContextAsync(
      {
        organizationId,
        userId: Number.isFinite(uid) ? uid : null,
        feature,
      },
      fn
    );
  } catch {
    return runWithAiUsageContextAsync(
      {
        userId: Number.isFinite(uid) ? uid : null,
        feature,
      },
      fn
    );
  }
}
