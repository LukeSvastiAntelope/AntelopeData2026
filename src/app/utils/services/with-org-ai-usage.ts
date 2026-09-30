import { ensurePrimaryOrgId } from '@/app/api/dashboard/persons/org';
import { runWithAiUsageContextAsync } from '@/app/utils/services/ai-usage-context';

/**
 * Attribute AI gateway metering to the caller's org for the duration of `fn`.
 *
 * Prefer an explicit `organizationId` when the route already knows the active
 * org (x-organization-id, conversation org, survey org, etc.). Otherwise
 * resolve via ensurePrimaryOrgId. Safe no-op when userId is missing and no
 * organizationId is provided.
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

  // Explicit org (including null) wins over ensurePrimaryOrgId.
  if (organizationId !== undefined) {
    const orgId =
      organizationId != null && Number(organizationId) > 0
        ? Number(organizationId)
        : null;
    return runWithAiUsageContextAsync(
      {
        organizationId: orgId,
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
