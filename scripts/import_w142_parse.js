const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: '.env 2' });

(async () => {
  // ====== CONFIG ======
  const CSV_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142.csv';
  const CODEBOOK_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142 Codebook.xlsx';
  const CREATED_BY = 1592; // Thomas
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

  // ====== SURVEY META ======
  const title = 'ATP W142 Full Import (csv-parse)';
  const slug = `atp-w142-full-${Date.now()}`;
  const description = 'Full import of Pew American Trends Panel Wave 142 (W142) using csv-parse';
  const [surveyRes] = await db.execute(
    `INSERT INTO surveys (title, description, slug, created_by, status, source, source_metadata, is_public, anonymity_level)
     VALUES (?,?,?,?, 'published','csv_import', ?,1,'full')`,
    [title, description, slug, CREATED_BY, JSON.stringify({ originalFileName: path.basename(CSV_PATH) })]
  );
  const surveyId = surveyRes.insertId;
  console.log('Created survey', surveyId);

  // ====== CODEBOOK PROCESSING ======
  const wb = xlsx.readFile(CODEBOOK_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const variableToLabel = {}; // variable -> question prompt label
  const valueMap = {}; // variable -> code -> label

  rows.forEach(r => {
    if (r.length < 4) return;
    const variable = String(r[0]).trim();
    const varLabel = String(r[1]).trim();
    const val = String(r[2]).trim();
    const valLabel = String(r[3]).trim();

    if (variable && varLabel) variableToLabel[variable] = varLabel;
    if (variable && val && valLabel && !valLabel.includes('Min') && !valLabel.includes('Max')) {
      if (!valueMap[variable]) valueMap[variable] = {};
      valueMap[variable][val] = valLabel;
    }
  });

  // ====== READ & PARSE CSV ======
  console.log('Reading CSV...');
  const csvInput = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parse(csvInput, {
    columns: true, // return objects keyed by column header
    skip_empty_lines: true,
    trim: true
  });
  console.log(`Parsed ${records.length} rows`);

  const headers = Object.keys(records[0]);
  // ====== INSERT QUESTIONS ======
  const varToQuestionId = {};
  let order = 1;

  for (const variable of headers) {
    const prompt = variableToLabel[variable] || variable;
    const type = valueMap[variable] ? 'rating' : 'text';
    const optionsJson = valueMap[variable] ? JSON.stringify(Object.values(valueMap[variable])) : null;
    const [qRes] = await db.execute(
      `INSERT INTO survey_questions (survey_id, type, prompt, options, question_order, is_required)
       VALUES (?,?,?,?,?,0)`,
      [surveyId, type, prompt, optionsJson, order]
    );
    varToQuestionId[variable] = qRes.insertId;
    order++;
  }
  console.log('Inserted', order - 1, 'questions');

  // ====== INSERT RESPONSES & ANSWERS ======
  let answerBatch = [];
  let responseCount = 0;

  for (const row of records) {
    const [rRes] = await db.execute(
      `INSERT INTO survey_responses (survey_id, submitted_at, demographics) VALUES (?,NOW(), '{}')`,
      [surveyId]
    );
    const responseId = rRes.insertId;
    responseCount++;

    for (const variable of headers) {
      const raw = (row[variable] || '').toString().trim();
      if (!raw) continue;
      const value = valueMap[variable] && valueMap[variable][raw] ? valueMap[variable][raw] : raw;
      answerBatch.push([responseId, varToQuestionId[variable], value]);
    }

    if (answerBatch.length >= BATCH_SIZE) {
      await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES ?`, [answerBatch]);
      answerBatch = [];
    }
  }

  if (answerBatch.length) {
    await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES ?`, [answerBatch]);
  }

  console.log('Imported responses', responseCount);

  await db.end();
  console.log('✅ Import complete. New survey ID:', surveyId);
})(); 