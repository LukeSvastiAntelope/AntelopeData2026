import { openSql as getMySQLConnection } from "./db";
import { RowDataPacket } from "mysql2/promise";
import { CohortDB, CohortFilterRule } from "../interface";

export const CohortRepo = {
  /**
   * List cohorts visible to a user.
   * - Admins can see all.
   * - Public cohorts visible to everyone.
   * - Org visibility TBD (future).
   */
  listVisibleCohorts: async (userId: number | null, userRole: "user" | "admin" | undefined) => {
    const db = await getMySQLConnection();

    let query = "SELECT * FROM cohorts WHERE visibility = 'public'";
    const params: any[] = [];

    if (userRole === "admin") {
      query = "SELECT * FROM cohorts"; // Admin sees all
    } else if (userId) {
      // Include cohorts the user created
      query = `${query} OR created_by = ?`;
      params.push(userId);
    }

    const [rows] = await db.execute<RowDataPacket[]>(query, params);

    // Map database columns to interface
    return rows.map(row => ({
      ...row,
      survey_id: row.survey_id,  // Keep original database field
      surveyId: row.survey_id,   // Add camelCase field for frontend compatibility
      filter_json: typeof row.filter_json === 'string' ? JSON.parse(row.filter_json) : row.filter_json
    })) as any[];
  },

  /**
   * Fetch a single cohort by id, scoped to ones the user may see (their own or
   * public). Returns null if not found / not permitted.
   */
  getById: async (id: number, userId: number | null) => {
    const db = await getMySQLConnection();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM cohorts WHERE id = ? AND (visibility = 'public' OR created_by = ?) LIMIT 1`,
      [id, userId]
    );
    if (!rows.length) return null;
    const row: any = rows[0];
    return {
      ...row,
      survey_id: row.survey_id,
      surveyId: row.survey_id,
      filter_json: typeof row.filter_json === 'string' ? JSON.parse(row.filter_json) : row.filter_json,
    } as any;
  },

  /**
   * Create a new cohort. Returns inserted ID.
   */
  createCohort: async (input: { name: string; description?: string; filter: CohortFilterRule[]; visibility: 'private'|'org'|'public'; createdBy: number; surveyId?: number; }) => {
    const db = await getMySQLConnection();
    const { name, description, filter, visibility, createdBy, surveyId } = input;
    const [result]: any = await db.execute(
      `INSERT INTO cohorts (name, description, filter_json, visibility, created_by, survey_id) VALUES (?, ?, ?, ?, ?, ?)` ,
      [name, description || null, JSON.stringify(filter), visibility, createdBy, surveyId || null]
    );
    return result.insertId as number;
  },

  updateCohort: async (id:number, userId:number, data: { name?: string; description?: string; filter?: CohortFilterRule[]; visibility?: 'private'|'org'|'public' }) => {
    const db = await getMySQLConnection();
    const fields: string[] = [];
    const params: any[] = [];
    if (data.name) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.filter) { fields.push('filter_json = ?'); params.push(JSON.stringify(data.filter)); }
    if (data.visibility) { fields.push('visibility = ?'); params.push(data.visibility); }
    if (fields.length === 0) return;
    params.push(id, userId);
    await db.execute(`UPDATE cohorts SET ${fields.join(', ')} WHERE id = ? AND created_by = ?`, params);
  },

  deleteCohort: async (id:number, userId:number) => {
    const db = await getMySQLConnection();
    await db.execute('DELETE FROM cohorts WHERE id = ? AND created_by = ?', [id, userId]);
  }
}; 