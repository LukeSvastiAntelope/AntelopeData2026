import { openSql } from '@/app/utils/database/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export const WORKFLOW_STAGES = [
  'plan',
  'know',
  'ask',
  'spread',
  'understand',
  'act',
] as const;

export type WorkflowStageId = (typeof WORKFLOW_STAGES)[number];

export interface WorkflowProgress {
  userId: number;
  currentStage: WorkflowStageId;
  completedStages: WorkflowStageId[];
  recommendedNext: WorkflowStageId;
  updatedAt: string | null;
}

function parseCompleted(raw: unknown): WorkflowStageId[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is WorkflowStageId =>
      WORKFLOW_STAGES.includes(v as WorkflowStageId)
    );
  } catch {
    return [];
  }
}

function firstIncomplete(completed: WorkflowStageId[]): WorkflowStageId {
  for (const stage of WORKFLOW_STAGES) {
    if (!completed.includes(stage)) return stage;
  }
  return 'act';
}

async function detectCompletedStages(userId: number): Promise<WorkflowStageId[]> {
  const db = await openSql();
  const completed: WorkflowStageId[] = [];

  const safeCount = async (sql: string, params: any[]) => {
    try {
      const [rows] = await db.execute<RowDataPacket[]>(sql, params);
      return Number(rows[0]?.cnt || rows[0]?.survey_count || rows[0]?.agent_count || rows[0]?.list_count || rows[0]?.enriched_count || 0);
    } catch (error) {
      console.warn('Workflow signal query skipped:', (error as Error)?.message || error);
      return 0;
    }
  };

  // Plan: any survey or agent profile owned by the user
  const surveyCount = await safeCount(
    `SELECT COUNT(*) AS cnt FROM surveys WHERE created_by = ?`,
    [userId]
  );
  const agentCount = await safeCount(
    `SELECT COUNT(*) AS cnt FROM agents WHERE user_id = ?`,
    [userId]
  );
  if (surveyCount > 0 || agentCount > 0) completed.push('plan');

  // Know: voter file / list upload signals
  const listCount = await safeCount(
    `SELECT COUNT(*) AS cnt FROM contact_lists WHERE user_id = ?`,
    [userId]
  );
  const enrichedCount = await safeCount(
    `SELECT COUNT(*) AS cnt
       FROM responder_agents ra
       INNER JOIN survey_responses sr ON sr.agent_token = ra.agent_token
       INNER JOIN surveys s ON s.id = sr.survey_id
      WHERE s.created_by = ?
        AND ra.voter_file_id IS NOT NULL
        AND ra.voter_file_id != ''`,
    [userId]
  );
  if (listCount > 0 || enrichedCount > 0) completed.push('know');

  // Ask: published or active survey
  const askCount = await safeCount(
    `SELECT COUNT(*) AS cnt
       FROM surveys
      WHERE created_by = ?
        AND status IN ('published', 'active')`,
    [userId]
  );
  if (askCount > 0) completed.push('ask');

  // Understand: analytics cached for one of the user's surveys
  const understandCount = await safeCount(
    `SELECT COUNT(*) AS cnt
       FROM survey_analytics_cache sac
       INNER JOIN surveys s ON s.id = sac.survey_id
      WHERE s.created_by = ?`,
    [userId]
  );
  if (understandCount > 0) completed.push('understand');

  return Array.from(new Set(completed));
}

export const WorkflowRepo = {
  async getProgress(userId: number): Promise<WorkflowProgress> {
    const db = await openSql();
    const detected = await detectCompletedStages(userId);

    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT user_id, current_stage, completed_stages, updated_at
         FROM user_workflow_progress
        WHERE user_id = ?
        LIMIT 1`,
      [userId]
    );

    const storedCompleted = rows.length ? parseCompleted(rows[0].completed_stages) : [];
    const completedStages = Array.from(
      new Set<WorkflowStageId>([...storedCompleted, ...detected])
    );
    const recommendedNext = firstIncomplete(completedStages);
    const currentStage = (rows[0]?.current_stage as WorkflowStageId) || recommendedNext;

    // Upsert so progress stays fresh without blocking UX
    await db.execute<ResultSetHeader>(
      `INSERT INTO user_workflow_progress (user_id, current_stage, completed_stages)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         current_stage = VALUES(current_stage),
         completed_stages = VALUES(completed_stages),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, recommendedNext, JSON.stringify(completedStages)]
    );

    return {
      userId,
      currentStage: WORKFLOW_STAGES.includes(currentStage) ? currentStage : recommendedNext,
      completedStages,
      recommendedNext,
      updatedAt: rows[0]?.updated_at ? String(rows[0].updated_at) : null,
    };
  },
};
