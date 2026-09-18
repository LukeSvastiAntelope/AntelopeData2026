import { openSql } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';

export type AgentId = 'planner' | 'news' | 'campaign_manager' | 'campaign_consultant';

/**
 * Structured finding written back from analytics / postable-insight (H1).
 * `conviction` = cleared significance gate (actionable evidence).
 * `context` = directional_only / ungated notes — never a basis for nextActions.
 */
export type SituationFinding = {
  claim: string;
  confidence: {
    effect: number;
    pCorrected: number;
    nPerGroup: {
      groupA: string;
      nA: number;
      groupB: string;
      nB: number;
    };
  };
  sampleProvenance: {
    surveyId: number;
    channels: string[];
    samplingNote: string;
  };
  source: string;
  timestamp: string;
  role: 'conviction' | 'context';
};

export interface AgentSituationSnapshot {
  summary: string;
  priorityTopics: string[];
  evidenceRefs: string[];
  openQuestions: string[];
  risks: string[];
  opportunities: string[];
  nextActions: string[];
  /** Provenance-tagged findings from the analytics write-back edge (H1). */
  findings: SituationFinding[];
  updatedAt: string;
}

export interface AgentSituationDocument {
  orgId: number;
  agentId: AgentId;
  version: number;
  snapshot: AgentSituationSnapshot;
}

export interface CommitSituationUpdateInput {
  orgId: number;
  agentId: AgentId;
  changedByAgent: AgentId;
  traceId: string;
  patch: Partial<AgentSituationSnapshot>;
  changeSummary?: string;
}

const MAX_FINDINGS = 40;

function emptySnapshot(): AgentSituationSnapshot {
  return {
    summary: '',
    priorityTopics: [],
    evidenceRefs: [],
    openQuestions: [],
    risks: [],
    opportunities: [],
    nextActions: [],
    findings: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeFindings(findings: SituationFinding[] | undefined): SituationFinding[] {
  if (!Array.isArray(findings)) return [];
  const seen = new Set<string>();
  const out: SituationFinding[] = [];
  for (const raw of findings) {
    if (!raw || typeof raw !== 'object') continue;
    const role = raw.role === 'conviction' ? 'conviction' : 'context';
    // Hard rule: conviction requires confidence stats; otherwise demote to context
    const hasStats =
      Number.isFinite(raw.confidence?.effect) &&
      Number.isFinite(raw.confidence?.pCorrected) &&
      Number.isFinite(raw.confidence?.nPerGroup?.nA) &&
      Number.isFinite(raw.confidence?.nPerGroup?.nB);
    const safeRole = role === 'conviction' && !hasStats ? 'context' : role;
    const claim = String(raw.claim || '').trim();
    if (!claim) continue;
    const key = `${safeRole}|${claim}|${raw.source || ''}|${raw.timestamp || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      claim,
      confidence: {
        effect: Number(raw.confidence?.effect) || 0,
        pCorrected: Number(raw.confidence?.pCorrected) || 1,
        nPerGroup: {
          groupA: String(raw.confidence?.nPerGroup?.groupA || 'n/a'),
          nA: Number(raw.confidence?.nPerGroup?.nA) || 0,
          groupB: String(raw.confidence?.nPerGroup?.groupB || 'n/a'),
          nB: Number(raw.confidence?.nPerGroup?.nB) || 0,
        },
      },
      sampleProvenance: {
        surveyId: Number(raw.sampleProvenance?.surveyId) || 0,
        channels: Array.isArray(raw.sampleProvenance?.channels)
          ? raw.sampleProvenance.channels.map(String)
          : [],
        samplingNote: String(raw.sampleProvenance?.samplingNote || ''),
      },
      source: String(raw.source || 'unknown'),
      timestamp: String(raw.timestamp || new Date().toISOString()),
      role: safeRole,
    });
  }
  return out
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, MAX_FINDINGS);
}

function mergeSnapshot(
  base: AgentSituationSnapshot,
  patch: Partial<AgentSituationSnapshot>
): AgentSituationSnapshot {
  const merged: AgentSituationSnapshot = {
    ...base,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  // Normalize string arrays with dedupe and bounded size.
  const normalize = (arr: string[] | undefined, max = 20) =>
    Array.from(new Set((arr || []).map((v) => String(v).trim()).filter(Boolean))).slice(0, max);
  merged.priorityTopics = normalize(merged.priorityTopics, 15);
  merged.evidenceRefs = normalize(merged.evidenceRefs, 30);
  merged.openQuestions = normalize(merged.openQuestions, 20);
  merged.risks = normalize(merged.risks, 15);
  merged.opportunities = normalize(merged.opportunities, 15);
  merged.nextActions = normalize(merged.nextActions, 20);
  // Findings: caller typically passes the full capped list; normalize + enforce roles.
  // Never invent nextActions from context findings here — that stays in write-back.
  if (patch.findings !== undefined) {
    merged.findings = normalizeFindings(patch.findings);
  } else {
    merged.findings = normalizeFindings(base.findings);
  }
  return merged;
}

export class AgentSituationService {
  static async getCurrent(orgId: number, agentId: AgentId): Promise<AgentSituationDocument> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT org_id AS orgId,
              agent_id AS agentId,
              current_version AS version,
              snapshot_json AS snapshot
       FROM agent_situation_documents
       WHERE org_id = ? AND agent_id = ?
       LIMIT 1`,
      [orgId, agentId]
    );
    if (!rows.length) {
      return {
        orgId,
        agentId,
        version: 0,
        snapshot: emptySnapshot(),
      };
    }

    const rawSnapshot = rows[0].snapshot;
    const parsedSnapshot =
      typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : (rawSnapshot || {});
    return {
      orgId: Number(rows[0].orgId),
      agentId: rows[0].agentId as AgentId,
      version: Number(rows[0].version || 0),
      snapshot: { ...emptySnapshot(), ...parsedSnapshot },
    };
  }

  static async commitUpdate(input: CommitSituationUpdateInput): Promise<AgentSituationDocument> {
    const db = await openSql();
    const current = await this.getCurrent(input.orgId, input.agentId);
    const nextVersion = current.version + 1;
    const mergedSnapshot = mergeSnapshot(current.snapshot, input.patch);
    const snapshotJson = JSON.stringify(mergedSnapshot);
    const deltaJson = JSON.stringify(input.patch || {});

    await db.execute(
      `INSERT INTO agent_situation_documents
        (org_id, agent_id, current_version, snapshot_json, updated_by_agent)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         current_version = VALUES(current_version),
         snapshot_json = VALUES(snapshot_json),
         updated_by_agent = VALUES(updated_by_agent)`,
      [input.orgId, input.agentId, nextVersion, snapshotJson, input.changedByAgent]
    );

    await db.execute(
      `INSERT INTO agent_situation_document_versions
        (org_id, agent_id, version, snapshot_json, delta_json, change_summary, changed_by_agent, trace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.orgId,
        input.agentId,
        nextVersion,
        snapshotJson,
        deltaJson,
        input.changeSummary || null,
        input.changedByAgent,
        input.traceId,
      ]
    );

    return {
      orgId: input.orgId,
      agentId: input.agentId,
      version: nextVersion,
      snapshot: mergedSnapshot,
    };
  }
}
