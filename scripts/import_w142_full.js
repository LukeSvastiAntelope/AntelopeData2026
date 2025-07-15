const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env 2' });

(async () => {
  const CSV_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142.csv';
  const CODEBOOK_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142 Codebook.xlsx';
  const CREATED_BY = 1592; // Thomas

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  // 1. Insert survey
  const title = 'ATP W142 Full Import';
  const slug = `atp-w142-full-${Date.now()}`;
  const description = 'Full import of Pew American Trends Panel Wave 142 (W142)';
  const [surveyRes] = await db.execute(
    `INSERT INTO surveys (title, description, slug, created_by, status, source, source_metadata, is_public, anonymity_level)
     VALUES (?,?,?,?, 'published','csv_import', ?,1,'full')`,
    [title, description, slug, CREATED_BY, JSON.stringify({ originalFileName: path.basename(CSV_PATH) })]
  );
  const surveyId = surveyRes.insertId;
  console.log('Created survey', surveyId);

  // 2. Build codebook maps
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

  // 3. Read CSV headers + prepare questions
  const headerLine = fs.readFileSync(CSV_PATH, 'utf8').split('\n')[0];
  const headers = headerLine.split(',').map(h => h.trim());

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

  // 4. Stream CSV rows
  const BATCH = 1000;
  const lines = fs.readFileSync(CSV_PATH, 'utf8').split(/\r?\n/);
  let answerBatch = [];
  let respBatch = [];
  let responseCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split(',');
    const [rRes] = await db.execute(
      `INSERT INTO survey_responses (survey_id, submitted_at, demographics) VALUES (?,NOW(), '{}')`,
      [surveyId]
    );
    const responseId = rRes.insertId;
    responseCount++;

    headers.forEach((variable, idx) => {
      const raw = cells[idx] ? cells[idx].trim() : '';
      if (!raw) return;
      let value = raw;
      if (valueMap[variable] && valueMap[variable][raw]) value = valueMap[variable][raw];
      answerBatch.push([responseId, varToQuestionId[variable], value]);
    });

    if (answerBatch.length >= BATCH) {
      await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES ?`, [answerBatch]);
      answerBatch = [];
    }
  }
  if (answerBatch.length) {
    await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES ?`, [answerBatch]);
  }
  console.log('Imported responses', responseCount);

  await db.end();
  console.log('✅ Full import complete. New survey ID:', surveyId);
})(); 