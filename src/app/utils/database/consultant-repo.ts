import { openSql } from '@/app/utils/database/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export type ConsultantMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type ConsultantStoredMessage = {
  role: ConsultantMessageRole;
  content: string;
  /** Optional metadata for UI (auto tool results, etc.) */
  meta?: {
    kind?: 'text' | 'tool_result' | 'staged_notice';
    toolName?: string;
    risk?: 'auto' | 'approval';
    stagedActionId?: number;
    implemented?: boolean;
  };
  createdAt?: string;
};

export type StagedActionStatus = 'pending' | 'approved' | 'executed' | 'dismissed';

export type ConsultantStagedAction = {
  id: number;
  conversationId: number;
  toolName: string;
  summary: string;
  payload: Record<string, unknown>;
  status: StagedActionStatus;
  resultSummary: string | null;
  resultData: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ConsultantConversation = {
  id: number;
  userId: number;
  organizationId: number | null;
  title: string | null;
  messages: ConsultantStoredMessage[];
  createdAt: string | null;
  updatedAt: string | null;
};

function parseJson<T>(raw: unknown, fallback: T): T {
  try {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw as T;
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

function mapStaged(row: RowDataPacket): ConsultantStagedAction {
  return {
    id: Number(row.id),
    conversationId: Number(row.conversation_id),
    toolName: String(row.tool_name),
    summary: String(row.summary || ''),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    status: row.status as StagedActionStatus,
    resultSummary: row.result_summary != null ? String(row.result_summary) : null,
    resultData: row.result_data != null ? parseJson(row.result_data, null) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function mapConversation(row: RowDataPacket): ConsultantConversation {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    organizationId: row.organization_id != null ? Number(row.organization_id) : null,
    title: row.title != null ? String(row.title) : null,
    messages: parseJson<ConsultantStoredMessage[]>(row.messages, []),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export const ConsultantRepo = {
  async getOrCreateConversation(params: {
    userId: number;
    organizationId?: number | null;
  }): Promise<ConsultantConversation> {
    const db = await openSql();
    const orgId = params.organizationId ?? null;

    // One active conversation per user (+ org when present)
    const [existing] = await db.execute<RowDataPacket[]>(
      orgId != null
        ? `SELECT * FROM consultant_conversations
           WHERE user_id = ? AND organization_id = ?
           ORDER BY updated_at DESC LIMIT 1`
        : `SELECT * FROM consultant_conversations
           WHERE user_id = ? AND organization_id IS NULL
           ORDER BY updated_at DESC LIMIT 1`,
      orgId != null ? [params.userId, orgId] : [params.userId]
    );

    if (existing[0]) return mapConversation(existing[0]);

    const welcome: ConsultantStoredMessage[] = [
      {
        role: 'assistant',
        content: [
          "I'm your campaign intake consultant.",
          '',
          '**What office are you running for**, and where (city / district / state)?',
          '',
          "Once I know that, I'll ask for the voter file or documents I need and produce concrete drafts — not generic advice.",
        ].join('\n'),
        meta: { kind: 'text' },
        createdAt: new Date().toISOString(),
      },
    ];

    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO consultant_conversations (user_id, organization_id, title, messages)
       VALUES (?, ?, ?, ?)`,
      [
        params.userId,
        orgId,
        'Campaign consultant',
        JSON.stringify(welcome),
      ]
    );

    const created = await this.getConversationById(Number(result.insertId), params.userId);
    if (!created) throw new Error('Failed to create consultant conversation');
    return created;
  },

  async getConversationById(
    conversationId: number,
    userId: number
  ): Promise<ConsultantConversation | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM consultant_conversations WHERE id = ? AND user_id = ? LIMIT 1`,
      [conversationId, userId]
    );
    return rows[0] ? mapConversation(rows[0]) : null;
  },

  async saveMessages(
    conversationId: number,
    userId: number,
    messages: ConsultantStoredMessage[]
  ): Promise<void> {
    const db = await openSql();
    await db.execute(
      `UPDATE consultant_conversations
       SET messages = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [JSON.stringify(messages), conversationId, userId]
    );
  },

  async createStagedAction(params: {
    conversationId: number;
    toolName: string;
    summary: string;
    payload: Record<string, unknown>;
  }): Promise<ConsultantStagedAction> {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO consultant_staged_actions
         (conversation_id, tool_name, summary, payload, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [
        params.conversationId,
        params.toolName,
        params.summary,
        JSON.stringify(params.payload || {}),
      ]
    );
    const action = await this.getStagedActionById(Number(result.insertId));
    if (!action) throw new Error('Failed to create staged action');
    return action;
  },

  async getStagedActionById(id: number): Promise<ConsultantStagedAction | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM consultant_staged_actions WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] ? mapStaged(rows[0]) : null;
  },

  async listStagedActions(
    conversationId: number,
    status?: StagedActionStatus | StagedActionStatus[]
  ): Promise<ConsultantStagedAction[]> {
    const db = await openSql();
    if (!status) {
      const [rows] = await db.execute<RowDataPacket[]>(
        `SELECT * FROM consultant_staged_actions
         WHERE conversation_id = ?
         ORDER BY created_at DESC`,
        [conversationId]
      );
      return rows.map(mapStaged);
    }
    const statuses = Array.isArray(status) ? status : [status];
    const placeholders = statuses.map(() => '?').join(',');
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM consultant_staged_actions
       WHERE conversation_id = ? AND status IN (${placeholders})
       ORDER BY created_at DESC`,
      [conversationId, ...statuses]
    );
    return rows.map(mapStaged);
  },

  async updateStagedAction(
    id: number,
    patch: {
      status?: StagedActionStatus;
      resultSummary?: string | null;
      resultData?: Record<string, unknown> | null;
    }
  ): Promise<ConsultantStagedAction | null> {
    const db = await openSql();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.status) {
      fields.push('status = ?');
      values.push(patch.status);
    }
    if (patch.resultSummary !== undefined) {
      fields.push('result_summary = ?');
      values.push(patch.resultSummary);
    }
    if (patch.resultData !== undefined) {
      fields.push('result_data = ?');
      values.push(patch.resultData == null ? null : JSON.stringify(patch.resultData));
    }
    if (!fields.length) return this.getStagedActionById(id);
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await db.execute(
      `UPDATE consultant_staged_actions SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    return this.getStagedActionById(id);
  },

  async assertConversationOwner(
    conversationId: number,
    userId: number
  ): Promise<ConsultantConversation | null> {
    return this.getConversationById(conversationId, userId);
  },
};
