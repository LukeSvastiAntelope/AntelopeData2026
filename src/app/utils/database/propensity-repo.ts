/**
 * voter_propensity materialized view repo (P2).
 * Refresh recomputes from Map prior + engagement events — never a frozen score.
 */

import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { computePropensityBlend } from '@/app/utils/propensity/blend';
import {
  eventsFromPersonCanvass,
  eventsFromTurfOutcome,
  type EngagementEvent,
} from '@/app/utils/propensity/evidence';
import type { PropensityTier } from '@/app/utils/propensity/config';
import { getDecayK } from '@/app/utils/propensity/config';

export type VoterPropensityRow = {
  person_record_id: number;
  organization_id: number;
  p0: number;
  evidence_e: number;
  prior_weight: number;
  posterior_q: number | null;
  propensity: number;
  confidence: number;
  tier: PropensityTier;
  decay_k: number;
  formula_version: string;
  evidence_json: unknown;
  recomputed_at: Date;
  // joined
  label?: string;
  party?: string | null;
  district?: string | null;
};

export class PropensityRepo {
  static async get(personRecordId: number): Promise<VoterPropensityRow | null> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT person_record_id, organization_id, p0, evidence_e, prior_weight, posterior_q,
              propensity, confidence, tier, decay_k, formula_version, evidence_json, recomputed_at
       FROM voter_propensity WHERE person_record_id = ? LIMIT 1`,
      [personRecordId]
    );
    const row = (rows as any[])[0];
    return row ? normalize(row) : null;
  }

  static async listByOrg(
    organizationId: number,
    opts?: { tier?: PropensityTier; limit?: number }
  ): Promise<VoterPropensityRow[]> {
    const sql = await openSql();
    const limit = Math.min(Math.max(opts?.limit || 500, 1), 5000);
    const params: unknown[] = [organizationId];
    let tierClause = '';
    if (opts?.tier) {
      tierClause = ' AND vp.tier = ?';
      params.push(opts.tier);
    }
    const [rows] = await sql.execute(
      `SELECT vp.person_record_id, vp.organization_id, vp.p0, vp.evidence_e, vp.prior_weight,
              vp.posterior_q, vp.propensity, vp.confidence, vp.tier, vp.decay_k,
              vp.formula_version, vp.evidence_json, vp.recomputed_at,
              CONCAT_WS(' ', pr.first_name, pr.last_name) AS label,
              COALESCE(NULLIF(pr.canvass_party,''), pr.party) AS party,
              pr.district
       FROM voter_propensity vp
       JOIN person_records pr ON pr.id = vp.person_record_id
       WHERE vp.organization_id = ?${tierClause}
       ORDER BY vp.propensity DESC, vp.person_record_id ASC
       LIMIT ${limit}`,
      params
    );
    return (rows as any[]).map(normalize);
  }

  static async funnelSummary(organizationId: number): Promise<{
    hot: number;
    warm: number;
    cold: number;
    total: number;
    avgPropensity: number | null;
    avgConfidence: number | null;
    decayK: number;
  }> {
    const sql = await openSql();
    const [rows] = await sql.execute(
      `SELECT
         SUM(tier = 'hot') AS hot,
         SUM(tier = 'warm') AS warm,
         SUM(tier = 'cold') AS cold,
         COUNT(*) AS total,
         AVG(propensity) AS avg_propensity,
         AVG(confidence) AS avg_confidence
       FROM voter_propensity WHERE organization_id = ?`,
      [organizationId]
    );
    const r = (rows as any[])[0] || {};
    return {
      hot: Number(r.hot) || 0,
      warm: Number(r.warm) || 0,
      cold: Number(r.cold) || 0,
      total: Number(r.total) || 0,
      avgPropensity: r.avg_propensity != null ? Number(r.avg_propensity) : null,
      avgConfidence: r.avg_confidence != null ? Number(r.avg_confidence) : null,
      decayK: getDecayK(),
    };
  }

  /** Recompute one person from live events + Map prior. */
  static async refreshPerson(
    personRecordId: number,
    organizationId: number
  ): Promise<VoterPropensityRow | null> {
    const sql = await openSql();
    const [people] = await sql.execute(
      `SELECT id, organization_id, party, canvass_party, voter_status, district, zip, state,
              canvass_status, canvass_confirmed_at
       FROM person_records
       WHERE id = ? AND organization_id <=> ?
       LIMIT 1`,
      [personRecordId, organizationId]
    );
    const person = (people as any[])[0];
    if (!person) return null;

    const events: EngagementEvent[] = [
      ...eventsFromPersonCanvass(person),
    ];

    const [turfRows] = await sql.execute(
      `SELECT status, party, recorded_at FROM turf_stop_outcomes
       WHERE person_record_id = ? AND organization_id = ?
       ORDER BY recorded_at DESC LIMIT 20`,
      [personRecordId, organizationId]
    );
    for (const t of turfRows as any[]) {
      events.push(...eventsFromTurfOutcome(t));
    }

    // Soft survey signal: responses near this person's lat/lng via same org geo (optional)
    // Kept lightweight — agent_token join is unreliable without person↔responder link.

    const blend = computePropensityBlend(
      {
        party: person.party,
        canvassParty: person.canvass_party,
        voterStatus: person.voter_status,
        district: person.district,
        zip: person.zip,
        state: person.state,
      },
      events
    );

    await sql.execute(
      `INSERT INTO voter_propensity
        (person_record_id, organization_id, p0, evidence_e, prior_weight, posterior_q,
         propensity, confidence, tier, decay_k, formula_version, evidence_json, recomputed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         p0 = VALUES(p0),
         evidence_e = VALUES(evidence_e),
         prior_weight = VALUES(prior_weight),
         posterior_q = VALUES(posterior_q),
         propensity = VALUES(propensity),
         confidence = VALUES(confidence),
         tier = VALUES(tier),
         decay_k = VALUES(decay_k),
         formula_version = VALUES(formula_version),
         evidence_json = VALUES(evidence_json),
         recomputed_at = CURRENT_TIMESTAMP`,
      [
        personRecordId,
        organizationId,
        blend.p0,
        blend.evidenceE,
        blend.priorWeight,
        blend.posteriorQ,
        blend.propensity,
        blend.confidence,
        blend.tier,
        blend.decayK,
        blend.formulaVersion,
        JSON.stringify({
          events: blend.evidenceDetail,
          provenance: blend.prior.provenance,
          materialized: true,
          note: 'Recomputed view — not a frozen ballistic score',
        }),
      ]
    );

    return this.get(personRecordId);
  }

  /** Refresh all geocoded persons for an org (cadence / manual). */
  static async refreshOrganization(
    organizationId: number,
    opts?: { limit?: number }
  ): Promise<{ refreshed: number }> {
    const sql = await openSql();
    const limit = Math.min(Math.max(opts?.limit || 2000, 1), 10000);
    const [rows] = await sql.execute(
      `SELECT id FROM person_records
       WHERE organization_id = ? AND latitude IS NOT NULL
       ORDER BY id ASC
       LIMIT ${limit}`,
      [organizationId]
    );
    let refreshed = 0;
    for (const r of rows as any[]) {
      await this.refreshPerson(Number(r.id), organizationId);
      refreshed++;
    }
    return { refreshed };
  }
}

function normalize(row: any): VoterPropensityRow {
  let evidence_json: unknown = row.evidence_json;
  if (typeof evidence_json === 'string') {
    try {
      evidence_json = JSON.parse(evidence_json);
    } catch {
      /* keep string */
    }
  }
  return {
    person_record_id: Number(row.person_record_id),
    organization_id: Number(row.organization_id),
    p0: Number(row.p0),
    evidence_e: Number(row.evidence_e),
    prior_weight: Number(row.prior_weight),
    posterior_q: row.posterior_q != null ? Number(row.posterior_q) : null,
    propensity: Number(row.propensity),
    confidence: Number(row.confidence),
    tier: row.tier,
    decay_k: Number(row.decay_k),
    formula_version: row.formula_version,
    evidence_json,
    recomputed_at: row.recomputed_at,
    label: row.label,
    party: row.party,
    district: row.district,
  };
}
