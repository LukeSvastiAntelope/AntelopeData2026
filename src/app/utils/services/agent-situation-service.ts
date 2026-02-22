import { openSql } from '@/app/utils/database/db';
import { RowDataPacket } from 'mysql2/promise';

export type AgentId = 'planner' | 'news' | 'campaign_manager';

export interface AgentSituationSnapshot {
  summary: string;
  priorityTopics: string[];
  evidenceRefs: string[];
  openQuestions: string[];
  risks: string[];
  opportunities: string[];
  nextActions: string[];
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

function emptySnapshot(): AgentSituationSnapshot {
  return {
    summary: '',
    priorityTopics: [],
    evidenceRefs: [],
    openQuestions: [],
    risks: [],
    opportunities: [],
    nextActions: [],
    updatedAt: new Date().toISOString(),
  };
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
  // Normalize arrays with dedupe and bounded size.
  const normalize = (arr: string[] | undefined, max = 20) =>
    Array.from(new Set((arr || []).map((v) => String(v).trim()).filter(Boolean))).slice(0, max);
  merged.priorityTopics = normalize(merged.priorityTopics, 15);
  merged.evidenceRefs = normalize(merged.evidenceRefs, 30);
  merged.openQuestions = normalize(merged.openQuestions, 20);
  merged.risks = normalize(merged.risks, 15);
  merged.opportunities = normalize(merged.opportunities, 15);
  merged.nextActions = normalize(merged.nextActions, 20);
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
