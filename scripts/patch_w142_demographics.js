const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const xlsx = require('xlsx');
const { parse } = require('csv-parse/sync');
require('dotenv').config({ path: '.env 2' });

(async () => {
  const SURVEY_ID = 81; // survey imported with csv-parse
  const CSV_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142.csv';
  const CODEBOOK_PATH = '/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142 Codebook.xlsx';

  // 1. Build codebook value maps
  const wb = xlsx.readFile(CODEBOOK_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const valueMap = {}; // variable -> code -> label

  rows.forEach(r => {
    if (r.length < 4) return;
    const variable = String(r[0]).trim();
    const code = String(r[2]).trim();
    const label = String(r[3]).trim();
    if (variable && code && label && !label.includes('Min') && !label.includes('Max')) {
      if (!valueMap[variable]) valueMap[variable] = {};
      valueMap[variable][code] = label;
    }
  });

  // Helper to decode value
  const decode = (variable, raw) => {
    if (!raw) return '';
    if (valueMap[variable] && valueMap[variable][raw]) return valueMap[variable][raw];
    return raw;
  };

  // 2. Parse CSV rows
  console.log('Reading CSV…');
  const csvInput = fs.readFileSync(CSV_PATH, 'utf8');
  const records = parse(csvInput, { columns: true, skip_empty_lines: true, trim: true });
  console.log('Parsed', records.length, 'rows');

  // 3. Get response IDs in order
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: false,
  });

  const [respRows] = await db.query('SELECT id FROM survey_responses WHERE survey_id = ? ORDER BY id ASC', [SURVEY_ID]);
  if (respRows.length !== records.length) {
    console.warn('⚠️ Response count mismatch:', respRows.length, 'vs CSV rows', records.length);
  }

  const BATCH = 500;
  let updates = 0;
  for (let i = 0; i < respRows.length; i++) {
    const responseId = respRows[i].id;
    const rec = records[i];

    // Build demographics object
    const demographics = {
      age: decode('F_AGECAT', rec['F_AGECAT']),
      education: decode('F_EDUCCAT2', rec['F_EDUCCAT2']),
      location: decode('F_CREGION', rec['F_CREGION']),
      gender: (() => { const g = decode('F_GENDER', rec['F_GENDER']); return g ? g.slice(0,10) : ''; })(),
      maritalStatus: decode('XMARITAL_W142', rec['XMARITAL_W142'])
    };

    // Remove empty keys
    Object.keys(demographics).forEach(k => { if (!demographics[k]) delete demographics[k]; });

    await db.execute('UPDATE survey_responses SET demographics = ? WHERE id = ?', [JSON.stringify(demographics), responseId]);
    updates++;

    if (updates % 1000 === 0) console.log(`Updated ${updates} responses`);
  }

  console.log('Completed. Updated', updates, 'responses');
  await db.end();
})(); 