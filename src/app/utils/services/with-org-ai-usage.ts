import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { runWithAiUsageContextAsync } from '@/app/utils/services/ai-usage-context';

/**
 * Attribute AI gateway metering to the caller's org for the duration of `fn`.
 *
 * Prefer an explicit positive `organizationId` when the route already resolved
 * the active org (H1 `resolveActiveOrgForUser`, survey org, etc.).
 *
 * Pass `undefined` (or omit) when the body has no org — we fall back to
 * `ensurePrimaryOrgId`. Do **not** pass `null` to mean "missing"; `null` is
 * treated the same as undefined so metering still attributes to the primary org.
 * Platform / unattributed work should use `runWithAiUsageContextAsync` directly.
 */
export async function withUserOrgAiUsage<T>(
  userId: string | number | null | undefined,
  feature: string,
  fn: () => Promise<T>,
  organizationId?: number | null
): Promise<T> {
  const uid =
    userId != null && userId !== '' && Number.isFinite(Number(userId))
      ? Number(userId)
      : null;

  const explicitOrg =
    organizationId != null && Number.isFinite(Number(organizationId)) && Number(organizationId) > 0
      ? Number(organizationId)
      : null;

  if (explicitOrg != null) {
    return runWithAiUsageContextAsync(
      {
        organizationId: explicitOrg,
        userId: uid,
        feature,
      },
      fn
    );
  }

  if (uid == null) {
    return runWithAiUsageContextAsync({ feature }, fn);
  }

  try {
    const resolvedOrgId = await ensurePrimaryOrgId(uid);
    return runWithAiUsageContextAsync(
      {
        organizationId: resolvedOrgId,
        userId: uid,
        feature,
      },
      fn
    );
  } catch {
    return runWithAiUsageContextAsync(
      {
        userId: uid,
        feature,
      },
      fn
    );
  }
}
