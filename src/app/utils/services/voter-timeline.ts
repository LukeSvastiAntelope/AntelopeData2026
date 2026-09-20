/**
 * VT1 — Per-voter event timeline (projection).
 *
 * Observed history only: project chronological TimelineEvent[] from existing
 * streams. No new store. Current state is derived; history is never overwritten.
 * Targeting scores stay in the propensity quarantine — this is map/observability.
 */

import { openSql } from '@/app/utils/database/db';
import type { Pool, RowDataPacket } from 'mysql2/promise';

export type TimelineEvent = {
  /** ISO-8601 timestamp */
  ts: string;
  /** Originating stream / subsystem */
  source:
    | 'person_records'
    | 'person_source_rows'
    | 'canvass_contacts'
    | 'turf_stop_outcomes'
    | 'survey_responses'
    | 'survey_optins'
    | 'contact_list_entries'
    | 'contact_suppression'
    | 'person_merge_audit'
    | 'fundraising';
  type: string;
  summary: string;
  payload: Record<string, unknown>;
};

type PersonIdentity = {
  id: number;
  organizationId: number | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date | string;
  canvassStatus: string | null;
  canvassParty: string | null;
  canvassNotes: string | null;
  canvassConfirmedAt: Date | string | null;
  mergedIntoPersonId: number | null;
  mergedAt: Date | string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function digitsOnly(phone: string | null | undefined): string {
  return String(phone || '').replace(/\D/g, '');
}

/** Last 10 digits for US-centric fuzzy match across +1 / formatting variants. */
function phoneMatchKeys(phone: string | null | undefined): string[] {
  const d = digitsOnly(phone);
  if (!d) return [];
  const keys = new Set<string>([d]);
  if (d.length >= 10) keys.add(d.slice(-10));
  return [...keys];
}

function normalizeEmail(email: string | null | undefined): string | null {
  const e = String(email || '')
    .trim()
    .toLowerCase();
  return e || null;
}

function pushEvent(events: TimelineEvent[], ev: TimelineEvent | null) {
  if (!ev || !ev.ts) return;
  events.push(ev);
}

/**
 * Resolve the live canonical person_records id, following soft-merge chains.
 */
async function resolveCanonicalId(
  db: Pool,
  personId: number
): Promise<{ canonicalId: number; organizationId: number | null } | null> {
  let id = personId;
  let organizationId: number | null = null;
  for (let depth = 0; depth < 16; depth++) {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, organization_id, merged_into_person_id
       FROM person_records WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row) return null;
    organizationId = row.organization_id != null ? Number(row.organization_id) : null;
    if (row.merged_into_person_id == null) {
      return { canonicalId: Number(row.id), organizationId };
    }
    id = Number(row.merged_into_person_id);
  }
  throw new Error(`merge chain too deep for person #${personId}`);
}

/**
 * Cluster = canonical survivor + every soft-archived loser that merged into it
 * (applied merges only). History stays attached to the cluster.
 */
async function loadClusterPersonIds(
  db: Pool,
  canonicalId: number,
  organizationId: number | null
): Promise<number[]> {
  const ids = new Set<number>([canonicalId]);

  // Direct losers pointing at canonical
  const [direct] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM person_records
     WHERE merged_into_person_id = ? AND organization_id <=> ?`,
    [canonicalId, organizationId]
  );
  for (const r of direct) ids.add(Number(r.id));

  // Audit table may retain pairs even if pointer was moved
  if (organizationId != null) {
    const [audits] = await db.execute<RowDataPacket[]>(
      `SELECT loser_person_id FROM person_merge_audit
       WHERE organization_id = ?
         AND survivor_person_id = ?
         AND status = 'applied'`,
      [organizationId, canonicalId]
    );
    for (const r of audits) ids.add(Number(r.loser_person_id));
  }

  return [...ids];
}

async function loadPersons(
  db: Pool,
  personIds: number[]
): Promise<PersonIdentity[]> {
  if (!personIds.length) return [];
  const placeholders = personIds.map(() => '?').join(',');
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, organization_id, email, phone, first_name, last_name,
            created_at, canvass_status, canvass_party, canvass_notes,
            canvass_confirmed_at, merged_into_person_id, merged_at
     FROM person_records WHERE id IN (${placeholders})`,
    personIds
  );
  return rows.map((r) => ({
    id: Number(r.id),
    organizationId: r.organization_id != null ? Number(r.organization_id) : null,
    email: r.email != null ? String(r.email) : null,
    phone: r.phone != null ? String(r.phone) : null,
    firstName: r.first_name != null ? String(r.first_name) : null,
    lastName: r.last_name != null ? String(r.last_name) : null,
    createdAt: r.created_at,
    canvassStatus: r.canvass_status != null ? String(r.canvass_status) : null,
    canvassParty: r.canvass_party != null ? String(r.canvass_party) : null,
    canvassNotes: r.canvass_notes != null ? String(r.canvass_notes) : null,
    canvassConfirmedAt: r.canvass_confirmed_at,
    mergedIntoPersonId:
      r.merged_into_person_id != null ? Number(r.merged_into_person_id) : null,
    mergedAt: r.merged_at,
  }));
}

async function tableExists(db: Pool, name: string): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function resolveAgentTokens(
  db: Pool,
  emails: string[]
): Promise<string[]> {
  if (!emails.length) return [];
  const placeholders = emails.map(() => '?').join(',');
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DISTINCT agent_token FROM responder_agents
     WHERE agent_token IS NOT NULL
       AND email IS NOT NULL
       AND LOWER(email) COLLATE utf8mb4_unicode_ci IN (${placeholders})`,
    emails.map((e) => e.toLowerCase())
  );
  return rows.map((r) => String(r.agent_token)).filter(Boolean);
}

function isFundraisingSourceName(name: string): boolean {
  return /fund|donor|donation|fec|contribute|gift/i.test(name);
}

/**
 * Project every known touchpoint for a voter into one chronological stream.
 * `personId` may be a merge loser — the cluster (canonical + losers) is used.
 */
export async function voterTimeline(personId: number): Promise<TimelineEvent[]> {
  const id = Number(personId);
  if (!Number.isFinite(id) || id <= 0) return [];

  const db = await openSql();
  const resolved = await resolveCanonicalId(db, id);
  if (!resolved) return [];

  const { canonicalId, organizationId } = resolved;
  const clusterIds = await loadClusterPersonIds(db, canonicalId, organizationId);
  const persons = await loadPersons(db, clusterIds);
  if (!persons.length) return [];

  const emails = [
    ...new Set(
      persons.map((p) => normalizeEmail(p.email)).filter((e): e is string => !!e)
    ),
  ];
  const phoneKeys = [
    ...new Set(persons.flatMap((p) => phoneMatchKeys(p.phone))),
  ];

  const agentTokens = await resolveAgentTokens(db, emails);
  const events: TimelineEvent[] = [];

  // ── person_records: created + door confirmation rollup ──────────────
  for (const p of persons) {
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || `person #${p.id}`;
    pushEvent(events, {
      ts: toIso(p.createdAt)!,
      source: 'person_records',
      type: 'person.created',
      summary: `Person record created (${name})`,
      payload: {
        personRecordId: p.id,
        canonicalPersonId: canonicalId,
        organizationId: p.organizationId,
        email: p.email,
        phone: p.phone,
      },
    });

    if (p.canvassConfirmedAt) {
      pushEvent(events, {
        ts: toIso(p.canvassConfirmedAt)!,
        source: 'person_records',
        type: 'canvass.confirmation',
        summary: `Door confirmation: ${p.canvassStatus || 'confirmed'}${
          p.canvassParty ? ` (${p.canvassParty})` : ''
        }`,
        payload: {
          personRecordId: p.id,
          status: p.canvassStatus,
          party: p.canvassParty,
          notes: p.canvassNotes,
        },
      });
    }
  }

  // ── person_source_rows (ingest provenance; fundraising-tagged sources) ─
  {
    const ph = clusterIds.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, organization_id, source_name, source_row_key, person_record_id,
              payload, created_at
       FROM person_source_rows WHERE person_record_id IN (${ph})`,
      clusterIds
    );
    for (const r of rows) {
      const sourceName = String(r.source_name || '');
      const fundraising = isFundraisingSourceName(sourceName);
      const payload =
        typeof r.payload === 'string'
          ? (() => {
              try {
                return JSON.parse(r.payload);
              } catch {
                return { raw: r.payload };
              }
            })()
          : (r.payload as Record<string, unknown>) || {};

      pushEvent(events, {
        ts: toIso(r.created_at)!,
        source: fundraising ? 'fundraising' : 'person_source_rows',
        type: fundraising ? 'fundraising.capture' : 'source.ingest',
        summary: fundraising
          ? `Fundraising/list capture from ${sourceName}`
          : `Source row ingested (${sourceName})`,
        payload: {
          sourceRowId: Number(r.id),
          personRecordId: Number(r.person_record_id),
          sourceName,
          sourceRowKey: r.source_row_key,
          payload,
        },
      });
    }
  }

  // ── canvass_contacts (append-only door knocks) ──────────────────────
  {
    const ph = clusterIds.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, organization_id, voter_geo_id, person_record_id, voter_file_id,
              turf_id, canvasser_id, status, note, party, survey_response_id,
              recorded_at
       FROM canvass_contacts WHERE person_record_id IN (${ph})`,
      clusterIds
    );
    for (const r of rows) {
      const status = String(r.status || 'contacted');
      pushEvent(events, {
        ts: toIso(r.recorded_at)!,
        source: 'canvass_contacts',
        type: 'canvass.contact',
        summary: `Door knock: ${status}${r.party ? ` (${r.party})` : ''}`,
        payload: {
          canvassContactId: Number(r.id),
          personRecordId: r.person_record_id != null ? Number(r.person_record_id) : null,
          voterGeoId: Number(r.voter_geo_id),
          turfId: r.turf_id != null ? Number(r.turf_id) : null,
          canvasserId: Number(r.canvasser_id),
          status,
          party: r.party,
          note: r.note,
          surveyResponseId:
            r.survey_response_id != null ? Number(r.survey_response_id) : null,
        },
      });
    }
  }

  // ── turf_stop_outcomes (latest rollup per stop — still observed) ────
  {
    const ph = clusterIds.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, organization_id, turf_id, voter_geo_id, person_record_id,
              status, party, notes, recorded_by, recorded_at, updated_at
       FROM turf_stop_outcomes WHERE person_record_id IN (${ph})`,
      clusterIds
    );
    for (const r of rows) {
      const status = String(r.status || 'contacted');
      pushEvent(events, {
        ts: toIso(r.updated_at || r.recorded_at)!,
        source: 'turf_stop_outcomes',
        type: 'canvass.turf_outcome',
        summary: `Turf stop outcome: ${status}${r.party ? ` (${r.party})` : ''}`,
        payload: {
          turfStopOutcomeId: Number(r.id),
          turfId: Number(r.turf_id),
          voterGeoId: Number(r.voter_geo_id),
          personRecordId: r.person_record_id != null ? Number(r.person_record_id) : null,
          status,
          party: r.party,
          notes: r.notes,
          recordedBy: Number(r.recorded_by),
          recordedAt: toIso(r.recorded_at),
        },
      });
    }
  }

  // ── survey_responses (+ answers) via agent_token / demographics email ─
  {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (agentTokens.length) {
      conditions.push(
        `sr.agent_token COLLATE utf8mb4_unicode_ci IN (${agentTokens.map(() => '?').join(',')})`
      );
      params.push(...agentTokens);
    }
    if (emails.length) {
      conditions.push(
        `LOWER(JSON_UNQUOTE(JSON_EXTRACT(sr.demographics, '$.email'))) COLLATE utf8mb4_unicode_ci IN (${emails.map(() => '?').join(',')})`
      );
      params.push(...emails);
      conditions.push(
        `EXISTS (
           SELECT 1 FROM responder_agents ra
           WHERE ra.created_from_response_id = sr.id
             AND ra.email IS NOT NULL
             AND LOWER(ra.email) COLLATE utf8mb4_unicode_ci IN (${emails.map(() => '?').join(',')})
         )`
      );
      params.push(...emails);
    }

    if (conditions.length) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT sr.id, sr.survey_id, sr.agent_token, sr.source, sr.submitted_at,
                sr.demographics, s.title AS survey_title
         FROM survey_responses sr
         LEFT JOIN surveys s ON s.id = sr.survey_id
         WHERE ${conditions.join(' OR ')}
         ORDER BY sr.submitted_at ASC`,
        params
      );

      const responseIds = rows.map((r) => Number(r.id));
      const answersByResponse = new Map<
        number,
        Array<{
          questionId: number;
          prompt: string | null;
          answerValue: string | null;
          answerCode: string | null;
        }>
      >();

      if (responseIds.length) {
        const ph = responseIds.map(() => '?').join(',');
        const [answers] = await db.execute<RowDataPacket[]>(
          `SELECT sa.response_id, sa.question_id, sa.answer_value,
                  sa.answer_code, sq.prompt
           FROM survey_answers sa
           LEFT JOIN survey_questions sq ON sq.id = sa.question_id
           WHERE sa.response_id IN (${ph})
           ORDER BY sa.question_id ASC`,
          responseIds
        );
        for (const a of answers) {
          const rid = Number(a.response_id);
          const list = answersByResponse.get(rid) || [];
          list.push({
            questionId: Number(a.question_id),
            prompt: a.prompt != null ? String(a.prompt) : null,
            answerValue: a.answer_value != null ? String(a.answer_value) : null,
            answerCode: a.answer_code != null ? String(a.answer_code) : null,
          });
          answersByResponse.set(rid, list);
        }
      }

      for (const r of rows) {
        const rid = Number(r.id);
        const answers = answersByResponse.get(rid) || [];
        const title = r.survey_title ? String(r.survey_title) : `survey #${r.survey_id}`;
        const answerPreview = answers
          .slice(0, 3)
          .map((a) => {
            const q = a.prompt ? a.prompt.slice(0, 40) : `Q${a.questionId}`;
            return `${q}: ${a.answerValue ?? a.answerCode ?? '—'}`;
          })
          .join('; ');

        pushEvent(events, {
          ts: toIso(r.submitted_at)!,
          source: 'survey_responses',
          type: 'survey.response',
          summary:
            answers.length > 0
              ? `Survey response on “${title}” (${answers.length} answer${answers.length === 1 ? '' : 's'})${
                  answerPreview ? ` — ${answerPreview}` : ''
                }`
              : `Survey response on “${title}”`,
          payload: {
            responseId: rid,
            surveyId: Number(r.survey_id),
            surveyTitle: r.survey_title,
            agentToken: r.agent_token,
            channel: r.source,
            answerCount: answers.length,
            answers,
          },
        });
      }
    }
  }

  // ── survey_optins (site / SMS opt-in) via phone ─────────────────────
  if (phoneKeys.length && (await tableExists(db, 'survey_optins'))) {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, survey_slug, survey_id, phone, consent, disclosure, source,
              created_at
       FROM survey_optins`
    );
    const keySet = new Set(phoneKeys);
    for (const r of rows) {
      const keys = phoneMatchKeys(r.phone != null ? String(r.phone) : null);
      if (!keys.some((k) => keySet.has(k))) continue;
      pushEvent(events, {
        ts: toIso(r.created_at)!,
        source: 'survey_optins',
        type: 'optin.signup',
        summary: `SMS/site opt-in${r.survey_slug ? ` for ${r.survey_slug}` : ''}`,
        payload: {
          optinId: Number(r.id),
          surveySlug: r.survey_slug,
          surveyId: r.survey_id != null ? Number(r.survey_id) : null,
          phone: r.phone,
          consent: Number(r.consent) === 1,
          disclosure: r.disclosure,
          optinSource: r.source,
        },
      });
    }
  }

  // ── contact_list_entries (list membership / outbound audience touch) ─
  if ((emails.length || phoneKeys.length) && (await tableExists(db, 'contact_list_entries'))) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (emails.length) {
      conditions.push(
        `LOWER(e.email) COLLATE utf8mb4_unicode_ci IN (${emails.map(() => '?').join(',')})`
      );
      params.push(...emails);
    }
    // Phone matched in JS after fetch of candidates by email OR broad phone digit filter is hard in SQL —
    // pull by email, and if only phones, scan recent matching phones via REPLACE chain.
    if (phoneKeys.length) {
      // Match last-10 digit forms with REPLACE stripping common punctuation
      const phoneExpr = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(e.phone,'-',''),' ',''),'(',''),')',''),'+','')`;
      const phoneConds = phoneKeys.map(() => `${phoneExpr} = ? OR ${phoneExpr} LIKE ?`);
      conditions.push(`(${phoneConds.join(' OR ')})`);
      for (const k of phoneKeys) {
        params.push(k, `%${k}`);
      }
    }

    if (conditions.length) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT e.id, e.list_id, e.phone, e.first_name, e.last_name, e.email,
                e.created_at, cl.name AS list_name
         FROM contact_list_entries e
         LEFT JOIN contact_lists cl ON cl.id = e.list_id
         WHERE ${conditions.join(' OR ')}`,
        params
      );
      for (const r of rows) {
        const listName = r.list_name ? String(r.list_name) : `list #${r.list_id}`;
        pushEvent(events, {
          ts: toIso(r.created_at)!,
          source: 'contact_list_entries',
          type: 'contact.list_entry',
          summary: `Added to contact list “${listName}”`,
          payload: {
            entryId: Number(r.id),
            listId: Number(r.list_id),
            listName: r.list_name,
            phone: r.phone,
            email: r.email,
            firstName: r.first_name,
            lastName: r.last_name,
          },
        });
      }
    }
  }

  // ── contact_suppression (DNC / outbound block) ──────────────────────
  {
    const ph = clusterIds.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, organization_id, voter_geo_id, voter_file_id, person_record_id,
              responder_agent_id, reason, source, notes, created_by, created_at
       FROM contact_suppression WHERE person_record_id IN (${ph})`,
      clusterIds
    );
    for (const r of rows) {
      pushEvent(events, {
        ts: toIso(r.created_at)!,
        source: 'contact_suppression',
        type: 'contact.suppression',
        summary: `Suppressed: ${r.reason || 'do_not_contact'} (${r.source})`,
        payload: {
          suppressionId: Number(r.id),
          personRecordId: r.person_record_id != null ? Number(r.person_record_id) : null,
          reason: r.reason,
          suppressionSource: r.source,
          notes: r.notes,
          voterGeoId: r.voter_geo_id != null ? Number(r.voter_geo_id) : null,
          voterFileId: r.voter_file_id,
          responderAgentId:
            r.responder_agent_id != null ? Number(r.responder_agent_id) : null,
        },
      });
    }
  }

  // ── person_merge_audit ──────────────────────────────────────────────
  if (organizationId != null) {
    const ph = clusterIds.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, organization_id, survivor_person_id, loser_person_id,
              match_score, status, created_at, undone_at, notes, merged_from
       FROM person_merge_audit
       WHERE organization_id = ?
         AND (survivor_person_id IN (${ph}) OR loser_person_id IN (${ph}))`,
      [organizationId, ...clusterIds, ...clusterIds]
    );
    for (const r of rows) {
      const status = String(r.status);
      const ts =
        status === 'undone' ? toIso(r.undone_at) || toIso(r.created_at) : toIso(r.created_at);
      pushEvent(events, {
        ts: ts!,
        source: 'person_merge_audit',
        type: status === 'undone' ? 'person.merge_undone' : 'person.merge',
        summary:
          status === 'undone'
            ? `Merge undone: #${r.loser_person_id} separated from #${r.survivor_person_id}`
            : `Merged person #${r.loser_person_id} → #${r.survivor_person_id} (score ${r.match_score})`,
        payload: {
          mergeAuditId: Number(r.id),
          survivorPersonId: Number(r.survivor_person_id),
          loserPersonId: Number(r.loser_person_id),
          matchScore: Number(r.match_score),
          status,
          notes: r.notes,
          mergedFrom: r.merged_from,
          createdAt: toIso(r.created_at),
          undoneAt: toIso(r.undone_at),
        },
      });
    }
  }

  // Chronological ascending; stable tie-break by source+type for determinism
  events.sort((a, b) => {
    const ta = new Date(a.ts).getTime();
    const tb = new Date(b.ts).getTime();
    if (ta !== tb) return ta - tb;
    const sa = `${a.source}:${a.type}`;
    const sb = `${b.source}:${b.type}`;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  return events;
}
