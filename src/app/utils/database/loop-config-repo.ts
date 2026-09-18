import { openSql } from '@/app/utils/database/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export type LoopAutonomy = 'manual' | 'propose' | 'auto_within_limits';

export type LoopMemoryConfig = {
  /** How many past cycles weight the next decision (high = exploit). */
  lookbackCycles: number;
  /** Half-life in days for decaying older cycle weight (low = explore). */
  decayHalfLife: number;
};

export type LoopTriggerConfig = {
  enabled: boolean;
  threshold: number;
};

export type LoopTriggersConfig = {
  response_count: LoopTriggerConfig;
  days_elapsed: LoopTriggerConfig;
  signal_salience: LoopTriggerConfig;
  on_demand: LoopTriggerConfig;
};

export type LoopBudgetsConfig = {
  spendCapPerCycle: number;
  maxSurveysPerListPerWindow: number;
  windowDays: number;
};

export type LoopConfig = {
  id: number;
  userId: number;
  organizationId: number;
  autonomy: LoopAutonomy;
  memory: LoopMemoryConfig;
  triggers: LoopTriggersConfig;
  budgets: LoopBudgetsConfig;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Conservative defaults — H1 governor; never blocks the product. */
export const DEFAULT_LOOP_CONFIG = {
  autonomy: 'propose' as LoopAutonomy,
  memory: {
    lookbackCycles: 3,
    decayHalfLife: 14,
  },
  triggers: {
    response_count: { enabled: true, threshold: 80 },
    days_elapsed: { enabled: true, threshold: 7 },
    signal_salience: { enabled: false, threshold: 0.7 },
    on_demand: { enabled: true, threshold: 1 },
  },
  budgets: {
    spendCapPerCycle: 0,
    maxSurveysPerListPerWindow: 2,
    windowDays: 30,
  },
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

function normalizeOrgId(organizationId?: number | null): number {
  if (organizationId == null || !Number.isFinite(Number(organizationId))) return 0;
  return Math.max(0, Number(organizationId));
}

function mapRow(row: RowDataPacket): LoopConfig {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    organizationId: Number(row.organization_id || 0),
    autonomy: (row.autonomy as LoopAutonomy) || DEFAULT_LOOP_CONFIG.autonomy,
    memory: {
      ...DEFAULT_LOOP_CONFIG.memory,
      ...parseJson(row.memory_json, {}),
    },
    triggers: {
      ...DEFAULT_LOOP_CONFIG.triggers,
      ...parseJson(row.triggers_json, {}),
    },
    budgets: {
      ...DEFAULT_LOOP_CONFIG.budgets,
      ...parseJson(row.budgets_json, {}),
    },
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export const LoopConfigRepo = {
  async getOrCreate(params: {
    userId: number;
    organizationId?: number | null;
  }): Promise<LoopConfig> {
    const db = await openSql();
    const orgId = normalizeOrgId(params.organizationId);

    const [existing] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM loop_config WHERE user_id = ? AND organization_id = ? LIMIT 1`,
      [params.userId, orgId]
    );
    if (existing[0]) return mapRow(existing[0]);

    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO loop_config
         (user_id, organization_id, autonomy, memory_json, triggers_json, budgets_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.userId,
        orgId,
        DEFAULT_LOOP_CONFIG.autonomy,
        JSON.stringify(DEFAULT_LOOP_CONFIG.memory),
        JSON.stringify(DEFAULT_LOOP_CONFIG.triggers),
        JSON.stringify(DEFAULT_LOOP_CONFIG.budgets),
      ]
    );

    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM loop_config WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return mapRow(rows[0]);
  },

  async update(
    params: {
      userId: number;
      organizationId?: number | null;
    },
    patch: Partial<{
      autonomy: LoopAutonomy;
      memory: Partial<LoopMemoryConfig>;
      triggers: Partial<LoopTriggersConfig>;
      budgets: Partial<LoopBudgetsConfig>;
    }>
  ): Promise<LoopConfig> {
    const current = await this.getOrCreate(params);
    const next = {
      autonomy: patch.autonomy || current.autonomy,
      memory: { ...current.memory, ...(patch.memory || {}) },
      triggers: {
        ...current.triggers,
        ...(patch.triggers || {}),
      } as LoopTriggersConfig,
      budgets: { ...current.budgets, ...(patch.budgets || {}) },
    };

    const db = await openSql();
    await db.execute(
      `UPDATE loop_config
       SET autonomy = ?, memory_json = ?, triggers_json = ?, budgets_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [
        next.autonomy,
        JSON.stringify(next.memory),
        JSON.stringify(next.triggers),
        JSON.stringify(next.budgets),
        current.id,
        params.userId,
      ]
    );

    return this.getOrCreate(params);
  },
};
