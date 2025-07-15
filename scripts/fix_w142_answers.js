const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: '.env 2' });

(async () => {
  const SURVEY_ID = 81;
  const CSV_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142.csv';
  const CODEBOOK_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142 Codebook.xlsx';
  const BATCH_SIZE = 1000;

  // ====== DB CONNECTION ======
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  // ====== CODEBOOK PROCESSING ======
  const wb = xlsx.readFile(CODEBOOK_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const valueMap = {}; // variable -> code -> label

  rows.forEach(r => {
    if (r.length < 4) return;
    const variable = String(r[0]).trim();
    const val = String(r[2]).trim();
    const valLabel = String(r[3]).trim();
    if (variable && val && valLabel && !valLabel.includes('Min') && !valLabel.includes('Max')) {
      if (!valueMap[variable]) valueMap[variable] = {};
      valueMap[variable][val] = valLabel;
    }
  });

  // ====== READ CSV ======
  console.log('Reading CSV...');
  const csvInput = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parse(csvInput, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  console.log(`Parsed ${records.length} rows`);

  // ====== GET QUESTION MAPPING ======
  const [questions] = await db.query('SELECT id, question_order FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC', [SURVEY_ID]);
  const headers = Object.keys(records[0]);
  const varToQuestionId = {};
  headers.forEach((variable, idx) => {
    if (questions[idx]) {
      varToQuestionId[variable] = questions[idx].id;
    }
  });

  // ====== GET RESPONSES ======
  const [responses] = await db.query('SELECT id FROM survey_responses WHERE survey_id = ? ORDER BY id ASC', [SURVEY_ID]);
  console.log(`Found ${responses.length} responses`);

  // ====== INSERT ANSWERS ======
  let answerBatch = [];
  let totalAnswers = 0;

  for (let i = 0; i < responses.length && i < records.length; i++) {
    const responseId = responses[i].id;
    const row = records[i];

    for (const variable of headers) {
      const questionId = varToQuestionId[variable];
      if (!questionId) continue;

      const raw = (row[variable] || '').toString().trim();
      if (!raw) continue;

      // Get human-readable value
      const value = valueMap[variable] && valueMap[variable][raw] ? valueMap[variable][raw] : raw;
      
      // Get numeric code
      const code = parseInt(raw);
      const answerCode = isNaN(code) ? null : code;

      answerBatch.push([responseId, questionId, value, answerCode]);
      totalAnswers++;

      if (answerBatch.length >= BATCH_SIZE) {
        await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value, answer_code) VALUES ?`, [answerBatch]);
        console.log(`Inserted ${totalAnswers} answers`);
        answerBatch = [];
      }
    }
  }

  if (answerBatch.length) {
    await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value, answer_code) VALUES ?`, [answerBatch]);
  }

  console.log(`✅ Completed. Inserted ${totalAnswers} answers for survey ${SURVEY_ID}`);
  await db.end();
})(); 