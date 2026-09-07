const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const xlsx = require('xlsx');
require('dotenv').config({ path: '.env 2' });

// Simple CSV parser using built-in modules
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',');
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ? values[idx].trim() : '';
    });
    rows.push(row);
  }
  return rows;
}

(async () => {
  const SURVEY_ID = 66;
  const CSV_PATH = path.resolve('/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142.csv');
  const CODEBOOK_PATH = path.resolve('/Users/thomaspetersen/Downloads/W142_Feb24/ATP W142 Codebook.xlsx');

  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  // 1. Load codebook variable -> question text map
  const wb = xlsx.readFile(CODEBOOK_PATH);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const varToLabel = {};
  const varToValueMap = {}; // Maps variable -> { code -> label }
  
  rows.forEach(row => {
    if (!row || row.length < 4) return;
    const variable = (row[0] || '').toString().trim();
    const variableLabel = (row[1] || '').toString().trim();
    const value = (row[2] || '').toString().trim();
    const valueLabel = (row[3] || '').toString().trim();
    
    // Store variable -> question label mapping
    if (variable && variableLabel && !varToLabel[variable]) {
      varToLabel[variable] = variableLabel;
    }
    
    // Store variable -> value mappings (skip min/max values)
    if (variable && value && valueLabel && 
        !valueLabel.includes('Min. Val') && 
        !valueLabel.includes('Max. Val')) {
      if (!varToValueMap[variable]) {
        varToValueMap[variable] = {};
      }
      varToValueMap[variable][value] = valueLabel;
    }
  });

  // 2. Load survey questions
  const [qRows] = await db.execute('SELECT id, prompt FROM survey_questions WHERE survey_id = ?', [SURVEY_ID]);
  const promptToId = {};
  qRows.forEach(q => { promptToId[q.prompt.trim().toLowerCase()] = q.id; });

  // Get ALL CSV headers to map comprehensively
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const csvHeaders = csvText.split('\n')[0].split(',').map(h => h.trim());
  
  // Build comprehensive variable -> question_id map
  const varToQuestionId = {};
  
  // Strategy 1: Direct label matching from codebook
  Object.entries(varToLabel).forEach(([variable, label]) => {
    const key = label.trim().toLowerCase();
    if (promptToId[key]) {
      varToQuestionId[variable] = { questionId: promptToId[key], isMulti: false };
    }
  });
  
  // Strategy 2: Fuzzy matching for each CSV header against all question prompts
  csvHeaders.forEach(variable => {
    if (varToQuestionId[variable]) return; // Already mapped
    
    // Try to find the best matching question prompt
    let bestMatch = null;
    let bestScore = 0;
    
    Object.entries(promptToId).forEach(([prompt, questionId]) => {
      const score = calculateSimilarity(variable.toLowerCase(), prompt);
      if (score > bestScore && score > 0.3) { // Minimum similarity threshold
        bestScore = score;
        bestMatch = questionId;
      }
    });
    
    if (bestMatch) {
      varToQuestionId[variable] = { questionId: bestMatch, isMulti: false };
    }
  });
  
  console.log('Mapped variables:', Object.keys(varToQuestionId).length);

// Simple similarity function for fuzzy matching
function calculateSimilarity(str1, str2) {
  // Remove common prefixes/suffixes and normalize
  const clean1 = str1.replace(/_w142$/i, '').replace(/^(usbest_|tc|sm|fact)/i, '');
  const clean2 = str2;
  
  // Check for word overlap
  const words1 = clean1.split(/[_\s]+/).filter(w => w.length > 2);
  const words2 = clean2.split(/[_\s]+/).filter(w => w.length > 2);
  
  let matches = 0;
  words1.forEach(w1 => {
    if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
      matches++;
    }
  });
  
  return words1.length > 0 ? matches / words1.length : 0;
}

  // 3. Fetch response ids
  const [respRows] = await db.execute('SELECT id FROM survey_responses WHERE survey_id = ? ORDER BY id ASC', [SURVEY_ID]);
  const responseIds = respRows.map(r => r.id);
  console.log('Responses in DB:', responseIds.length);

  // 4. Parse CSV and collect answer inserts
  console.log('Reading CSV file...');
  const csvRows = parseCSV(csvText);
  console.log('CSV rows parsed:', csvRows.length);

  const BATCH_SIZE = 500;
  let batch = [];
  const insertAnswers = async () => {
    if (batch.length === 0) return;
    const values = batch.map(({ responseId, questionId, answer }) => [responseId, questionId, answer]);
    await db.query('INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES ? ON DUPLICATE KEY UPDATE answer_value = VALUES(answer_value)', [values]);
    console.log(`Inserted ${batch.length} answers`);
    batch = [];
  };

  for (let csvIndex = 0; csvIndex < Math.min(csvRows.length, responseIds.length); csvIndex++) {
    const row = csvRows[csvIndex];
    const responseId = responseIds[csvIndex];
    
    for (const [variable, mapping] of Object.entries(varToQuestionId)) {
      if (row[variable] !== undefined && row[variable] !== '') {
        let rawValue = String(row[variable]).trim();
        
        // Convert numeric code to human-readable label if mapping exists
        let val = rawValue;
        if (varToValueMap[variable] && varToValueMap[variable][rawValue]) {
          val = varToValueMap[variable][rawValue];
        }
        
        batch.push({ responseId, questionId: mapping.questionId, answer: val });
        if (batch.length >= BATCH_SIZE) {
          await insertAnswers();
        }
      }
    }
    
    if (csvIndex % 100 === 0) {
      console.log(`Processed ${csvIndex + 1}/${Math.min(csvRows.length, responseIds.length)} rows`);
    }
  }
  
  await insertAnswers();
  console.log('Backfill complete');
  await db.end();
})(); 