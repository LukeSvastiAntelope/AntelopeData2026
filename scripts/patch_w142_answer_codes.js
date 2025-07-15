const fs = require('fs');
const mysql = require('mysql2/promise');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: '.env 2' });

(async () => {
  const SURVEY_ID = 81;
  const CSV_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142.csv';
  const BATCH_SIZE = 5000; // number of UPDATE statements per flush

  // 1. Read CSV
  console.log('Reading CSV…');
  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  console.log('Rows:', records.length);

  // 2. DB connection
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: false,
  });

  // 3. Build variable -> questionId map via question_order
  const [qs] = await db.query('SELECT id, question_order FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC', [SURVEY_ID]);
  const headers = Object.keys(records[0]);
  if (qs.length !== headers.length) {
    console.warn('Question count mismatch:', qs.length, headers.length);
  }
  const varToQuestionId = {};
  headers.forEach((v, idx) => { if (qs[idx]) varToQuestionId[v] = qs[idx].id; });

  // 4. Get response ids in the same import order (ascending id)
  const [respRows] = await db.query('SELECT id FROM survey_responses WHERE survey_id = ? ORDER BY id ASC', [SURVEY_ID]);
  if (respRows.length !== records.length) {
    console.warn('Response mismatch DB vs CSV', respRows.length, records.length);
  }

  let updates = [];
  let processed = 0;
  for (let i = 0; i < respRows.length; i++) {
    const responseId = respRows[i].id;
    const row = records[i];

    for (const variable of headers) {
      const qId = varToQuestionId[variable];
      if (!qId) continue;
      const raw = row[variable] && row[variable].toString().trim();
      if (!raw) continue;
      const codeInt = parseInt(raw);
      if (isNaN(codeInt)) continue; // skip non-numeric answers (open text)
      updates.push([codeInt, responseId, qId]);
      if (updates.length >= BATCH_SIZE) {
        await flush(db, updates);
        processed += updates.length;
        console.log('Updated', processed);
        updates = [];
      }
    }
  }
  if (updates.length) {
    await flush(db, updates);
    processed += updates.length;
  }
  console.log('Completed. Total updates:', processed);
  await db.end();
})();

async function flush(db, batch) {
  // batch: [code, response_id, question_id]
  const sql = 'UPDATE survey_answers SET answer_code = ? WHERE response_id = ? AND question_id = ?';
  const promises = batch.map(([code, resp, q]) => db.execute(sql, [code, resp, q]));
  await Promise.all(promises);
} 