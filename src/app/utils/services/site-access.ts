/**
 * Auth + entitlement gate for Website / sites APIs (Sites S4).
 */

import { NextRequest, NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { requireUserId } from '@/app/utils/auth/require-user';
import { openSql } from '@/app/utils/database/db';
import {
  getPrimaryOrganizationId,
  hasWebsiteAddon,
} from '@/app/utils/services/org-entitlements';

export type WebsiteAccess = {
  userId: string;
  userIdNum: number;
  organizationId: number;
};

export async function userBelongsToOrganization(
  userId: number | string,
  organizationId: number
): Promise<boolean> {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return false;
  if (!Number.isFinite(organizationId) || organizationId <= 0) return false;
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT 1 FROM organization_members
     WHERE user_id = ? AND organization_id = ? AND status = 'active'
     LIMIT 1`,
    [uid, organizationId]
  );
  return Boolean(rows?.[0]);
}

export type OrgCampaignContext = {
  id: number;
  name: string | null;
  officeType: string | null;
  state: string | null;
  districtCode: string | null;
  candidateName: string | null;
  party: string | null;
  electionYear: number | string | null;
  description: string | null;
};

export async function getOrgCampaignContext(
  organizationId: number
): Promise<OrgCampaignContext | null> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name, office_type, state, district_code,
            candidate_name, party, election_year, description
     FROM organizations WHERE id = ? LIMIT 1`,
    [organizationId]
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name ?? null,
    officeType: row.office_type ?? null,
    state: row.state ?? null,
    districtCode: row.district_code ?? null,
    candidateName: row.candidate_name ?? null,
    party: row.party ?? null,
    electionYear: row.election_year ?? null,
    description: row.description ?? null,
  };
}

/**
 * Require authenticated user + Website add-on for their (or specified) org.
 * Returns WebsiteAccess or a NextResponse error.
 */
export async function requireWebsiteAccess(
  req: NextRequest,
  organizationIdHint?: number | null
): Promise<WebsiteAccess | NextResponse> {
  const auth = requireUserId(req);
  if (typeof auth !== 'string') return auth;
  const userIdNum = Number(auth);
  if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
    return NextResponse.json(
      { status: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  let organizationId =
    organizationIdHint != null && Number.isFinite(Number(organizationIdHint))
      ? Number(organizationIdHint)
      : null;

  if (organizationId != null) {
    const member = await userBelongsToOrganization(userIdNum, organizationId);
    if (!member) {
      return NextResponse.json(
        { status: false, message: 'Forbidden' },
        { status: 403 }
      );
    }
  } else {
    organizationId = await getPrimaryOrganizationId(auth);
  }

  if (!organizationId) {
    return NextResponse.json(
      {
        status: false,
        message: 'No campaign organization found',
        code: 'NO_ORG',
      },
      { status: 400 }
    );
  }

  const entitled = await hasWebsiteAddon(organizationId);
  if (!entitled) {
    return NextResponse.json(
      {
        status: false,
        message: 'Website add-on required',
        code: 'NOT_ENTITLED',
        organizationId,
      },
      { status: 402 }
    );
  }

  return { userId: auth, userIdNum, organizationId };
}
