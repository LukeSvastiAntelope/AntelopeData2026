/**
 * Org entitlements — lightweight add-on flags (Sites S3).
 * Stripe/billing hangs on enableWebsiteAddon metadata later; not built here.
 */

import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export const WEBSITE_ADDON_ENTITLEMENT = 'website_addon' as const;

export type OrgEntitlementKey = typeof WEBSITE_ADDON_ENTITLEMENT | string;

export async function hasEntitlement(
  organizationId: number,
  entitlement: OrgEntitlementKey
): Promise<boolean> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return false;
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT enabled FROM org_entitlements
     WHERE organization_id = ? AND entitlement = ? AND enabled = 1
     LIMIT 1`,
    [organizationId, entitlement]
  );
  return Boolean(rows?.[0]?.enabled);
}

/** Server check for the Website add-on (~$20/mo product). */
export async function hasWebsiteAddon(organizationId: number): Promise<boolean> {
  return hasEntitlement(organizationId, WEBSITE_ADDON_ENTITLEMENT);
}

/**
 * Flip the website add-on on for an org.
 * TODO(stripe): replace with Checkout session + webhook; this is the entitlement seam.
 */
export async function enableWebsiteAddon(
  organizationId: number,
  enabledBy?: number | null,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    throw new Error('organizationId required');
  }
  const db = await openSql();
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO org_entitlements
       (organization_id, entitlement, enabled, enabled_at, enabled_by, metadata)
     VALUES (?, ?, 1, CURRENT_TIMESTAMP, ?, ?)
     ON DUPLICATE KEY UPDATE
       enabled = 1,
       enabled_at = COALESCE(enabled_at, CURRENT_TIMESTAMP),
       enabled_by = COALESCE(VALUES(enabled_by), enabled_by),
       metadata = COALESCE(VALUES(metadata), metadata),
       updated_at = CURRENT_TIMESTAMP`,
    [
      organizationId,
      WEBSITE_ADDON_ENTITLEMENT,
      enabledBy ?? null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
  return result.affectedRows > 0;
}

export async function disableWebsiteAddon(
  organizationId: number
): Promise<boolean> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return false;
  const db = await openSql();
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE org_entitlements
     SET enabled = 0, updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = ? AND entitlement = ?`,
    [organizationId, WEBSITE_ADDON_ENTITLEMENT]
  );
  return result.affectedRows > 0;
}

/** Primary active org for a user (owner preferred) — same ordering as /api/me. */
export async function getPrimaryOrganizationId(
  userId: number | string
): Promise<number | null> {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT o.id
     FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, o.created_at ASC
     LIMIT 1`,
    [uid]
  );
  const id = rows?.[0]?.id;
  return id != null ? Number(id) : null;
}
