import { getConnection } from '@/app/utils/database/db';

/** Resolve the caller's primary org, creating a personal campaign org if none exists. */
export async function ensurePrimaryOrgId(userId: string | number): Promise<number> {
  const db = await getConnection();
  const uid = Number(userId);

  const [orgRows]: any = await db.execute(
    `SELECT o.id
     FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = ? AND om.status = 'active'
     ORDER BY om.role = 'owner' DESC, o.created_at ASC
     LIMIT 1`,
    [uid]
  );
  if (orgRows?.[0]?.id) return Number(orgRows[0].id);

  const slug = `campaign-${uid}-${Date.now().toString(36)}`;
  const [ins]: any = await db.execute(
    `INSERT INTO organizations (name, slug, description, created_by)
     VALUES (?, ?, ?, ?)`,
    ['My campaign', slug, 'Auto-created for household map data', uid]
  );
  const orgId = Number(ins.insertId);
  await db.execute(
    `INSERT INTO organization_members (organization_id, user_id, role, status, accepted_at)
     VALUES (?, ?, 'owner', 'active', NOW())`,
    [orgId, uid]
  );

  // Attach any orphaned D1 fixture rows (loaded with --org 1 before an org existed)
  try {
    await db.execute(
      `UPDATE person_records SET organization_id = ? WHERE organization_id = 1 OR organization_id IS NULL`,
      [orgId]
    );
    await db.execute(
      `UPDATE address_points SET organization_id = ? WHERE organization_id = 1 OR organization_id IS NULL`,
      [orgId]
    );
    await db.execute(
      `UPDATE person_source_rows SET organization_id = ? WHERE organization_id = 1 OR organization_id IS NULL`,
      [orgId]
    );
  } catch {
    /* tables may lack rows */
  }

  return orgId;
}
