#!/usr/bin/env node
/**
 * Digest Survey Stats
 * -------------------
 * Computes basic distributions for every quantitative question in a survey
 * and writes results into `survey_question_stats` (and optionally the demo split table).
 *
 * Usage:
 *   node scripts/digest-survey-stats.js <surveyId>
 *
 * This script is idempotent: before inserting, it deletes any existing rows for the
 * given surveyId so it can safely be re-run.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

if (process.argv.length < 3) {
  console.error('Usage: node scripts/digest-survey-stats.js <surveyId>');
  process.exit(1);
}

const SURVEY_ID = Number(process.argv[2]);

if (Number.isNaN(SURVEY_ID)) {
  console.error('Invalid surveyId provided');
  process.exit(1);
}

// Re-use same connection params as other scripts
const connectionParams = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

(async () => {
  let db;
  try {
    console.log(`🔍 Starting digest for survey ${SURVEY_ID}`);
    db = await mysql.createConnection(connectionParams);

    // 1. Fetch quantitative questions (single-choice, number, rating). We ignore text/open-ended.
    const [questionRows] = await db.execute(
      `SELECT id, type
       FROM survey_questions
       WHERE survey_id = ?
       AND type IN ('single-choice','multiple-choice','number','rating','yes-no')`,
      [SURVEY_ID]
    );

    if (questionRows.length === 0) {
      console.log('⚠️  No quantitative questions found; nothing to digest');
      return;
    }

    console.log(`📝 Found ${questionRows.length} quantitative questions`);

    // Clear previous stats (idempotent behaviour)
    await db.execute('DELETE FROM survey_question_stats WHERE survey_id = ?', [SURVEY_ID]);

    // Helper to insert stats rows in bulk
    const statsBuffer = [];

    for (const q of questionRows) {
      console.log(`   • Processing question ${q.id}`);

      // Depending on type, build SQL to get distribution
      let sql;
      if (q.type === 'number') {
        // For numeric we bucket into deciles for now (can refine later)
        sql = `SELECT 
                  CONCAT(FLOOR(CAST(sa.answer_value AS DECIMAL))/10)*10, '-', FLOOR(CAST(sa.answer_value AS DECIMAL)/10)*10 + 9) AS option_value,
                  COUNT(*) AS cnt
                FROM survey_answers sa
                JOIN survey_responses sr ON sa.response_id = sr.id
                WHERE sr.survey_id = ? AND sa.question_id = ? AND sa.answer_value IS NOT NULL
                GROUP BY option_value`;
      } else {
        // Choice questions – use stored answer_code/answer_value as option label
        sql = `SELECT sa.answer_value AS option_value, COUNT(*) AS cnt
                FROM survey_answers sa
                JOIN survey_responses sr ON sa.response_id = sr.id
                WHERE sr.survey_id = ? AND sa.question_id = ?
                GROUP BY option_value`;
      }

      const [dist] = await db.execute(sql, [SURVEY_ID, q.id]);
      const total = dist.reduce((sum, r) => sum + Number(r.cnt), 0);

      for (const row of dist) {
        statsBuffer.push([
          SURVEY_ID,
          q.id,
          String(row.option_value),
          Number(row.cnt),
          total === 0 ? 0 : ((Number(row.cnt) / total) * 100).toFixed(4),
        ]);
      }
    }

    if (statsBuffer.length > 0) {
      console.log(`💾 Inserting ${statsBuffer.length} stats rows`);
      await db.query(
        `INSERT INTO survey_question_stats
          (survey_id, question_id, option_value, respondent_count, respondent_pct)
         VALUES ?`,
        [statsBuffer]
      );
    }

    // Mark survey as processed
    await db.execute('UPDATE surveys SET processed_stats = 1 WHERE id = ?', [SURVEY_ID]);

    console.log('✅ Digest completed successfully');
  } catch (err) {
    console.error('❌ Digest failed:', err.message);
    throw err;
  } finally {
    if (db) await db.end();
  }
})(); 