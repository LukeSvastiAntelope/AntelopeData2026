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

  let db;
  try {
    // ====== DB CONNECTION ======
    console.log('Connecting to database...');
    db = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      multipleStatements: false // Safer
    });
    console.log('✅ Database connected');

    // ====== VERIFY SURVEY EXISTS ======
    const [surveyCheck] = await db.query('SELECT title FROM surveys WHERE id = ?', [SURVEY_ID]);
    if (surveyCheck.length === 0) {
      throw new Error(`Survey ${SURVEY_ID} not found`);
    }
    console.log('✅ Survey found:', surveyCheck[0].title);

    // ====== CODEBOOK PROCESSING ======
    console.log('Loading codebook...');
    if (!fs.existsSync(CODEBOOK_PATH)) {
      throw new Error(`Codebook not found: ${CODEBOOK_PATH}`);
    }
    
    const wb = xlsx.readFile(CODEBOOK_PATH);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const valueMap = {};

    let codebookMappings = 0;
    rows.forEach(r => {
      if (r.length < 4) return;
      const variable = String(r[0]).trim();
      const val = String(r[2]).trim();
      const valLabel = String(r[3]).trim();
      if (variable && val && valLabel && !valLabel.includes('Min') && !valLabel.includes('Max')) {
        if (!valueMap[variable]) valueMap[variable] = {};
        valueMap[variable][val] = valLabel;
        codebookMappings++;
      }
    });
    console.log('✅ Codebook loaded:', Object.keys(valueMap).length, 'variables,', codebookMappings, 'mappings');

    // ====== READ CSV ======
    console.log('Reading CSV...');
    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`CSV not found: ${CSV_PATH}`);
    }
    
    const csvInput = fs.readFileSync(CSV_PATH, 'utf8');
    const records = parse(csvInput, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    console.log('✅ CSV parsed:', records.length, 'rows');

    // ====== VERIFY QUESTION MAPPING ======
    const [questions] = await db.query('SELECT id, question_order FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC', [SURVEY_ID]);
    const headers = Object.keys(records[0]);
    
    if (questions.length !== headers.length) {
      console.warn(`⚠️ Question count mismatch: DB has ${questions.length}, CSV has ${headers.length}`);
    }
    
    const varToQuestionId = {};
    headers.forEach((variable, idx) => {
      if (questions[idx]) {
        varToQuestionId[variable] = questions[idx].id;
      }
    });
    console.log('✅ Question mapping:', Object.keys(varToQuestionId).length, 'variables mapped');

    // ====== VERIFY RESPONSES ======
    const [responses] = await db.query('SELECT id FROM survey_responses WHERE survey_id = ? ORDER BY id ASC', [SURVEY_ID]);
    console.log('✅ Found responses:', responses.length);
    
    if (responses.length !== records.length) {
      console.warn(`⚠️ Response count mismatch: DB has ${responses.length}, CSV has ${records.length}`);
    }

    // ====== CHECK FOR EXISTING ANSWERS ======
    const [existingAnswers] = await db.query(`
      SELECT COUNT(*) as count 
      FROM survey_answers sa 
      JOIN survey_responses sr ON sa.response_id = sr.id 
      WHERE sr.survey_id = ?
    `, [SURVEY_ID]);
    
    if (existingAnswers[0].count > 0) {
      throw new Error(`Survey ${SURVEY_ID} already has ${existingAnswers[0].count} answers. Aborting to prevent duplicates.`);
    }
    console.log('✅ No existing answers found, safe to proceed');

    // ====== INSERT ANSWERS WITH COMPREHENSIVE ERROR HANDLING ======
    let answerBatch = [];
    let totalAnswers = 0;
    let processedRows = 0;
    let errors = [];

    console.log('Starting answer insertion...');
    const startTime = Date.now();

    for (let i = 0; i < Math.min(responses.length, records.length); i++) {
      try {
        const responseId = responses[i].id;
        const row = records[i];
        processedRows++;

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
            try {
              const result = await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value, answer_code) VALUES ?`, [answerBatch]);
              console.log(`✅ Inserted batch: ${totalAnswers} total answers (${processedRows}/${records.length} rows)`);
              
              // Verify the batch was actually inserted
              if (result[0].affectedRows !== answerBatch.length) {
                throw new Error(`Expected ${answerBatch.length} insertions, got ${result[0].affectedRows}`);
              }
              
            } catch (batchError) {
              console.error(`❌ Batch insert failed at row ${i}:`, batchError.message);
              errors.push(`Batch at row ${i}: ${batchError.message}`);
              // Don't continue if batch fails
              throw batchError;
            }
            answerBatch = [];
          }
        }

        // Progress update every 1000 rows
        if (processedRows % 1000 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = processedRows / elapsed;
          const eta = (records.length - processedRows) / rate;
          console.log(`Progress: ${processedRows}/${records.length} rows (${rate.toFixed(1)} rows/sec, ETA: ${eta.toFixed(0)}s)`);
        }

      } catch (rowError) {
        console.error(`❌ Error processing row ${i}:`, rowError.message);
        errors.push(`Row ${i}: ${rowError.message}`);
        throw rowError; // Stop on any error
      }
    }

    // Insert final batch
    if (answerBatch.length > 0) {
      try {
        const result = await db.query(`INSERT INTO survey_answers (response_id, question_id, answer_value, answer_code) VALUES ?`, [answerBatch]);
        console.log(`✅ Inserted final batch: ${totalAnswers} total answers`);
        
        if (result[0].affectedRows !== answerBatch.length) {
          throw new Error(`Expected ${answerBatch.length} insertions, got ${result[0].affectedRows}`);
        }
      } catch (finalError) {
        console.error(`❌ Final batch insert failed:`, finalError.message);
        throw finalError;
      }
    }

    // ====== FINAL VERIFICATION ======
    const [finalCount] = await db.query(`
      SELECT COUNT(*) as count 
      FROM survey_answers sa 
      JOIN survey_responses sr ON sa.response_id = sr.id 
      WHERE sr.survey_id = ?
    `, [SURVEY_ID]);

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n✅ IMPORT COMPLETED SUCCESSFULLY`);
    console.log(`   Total answers inserted: ${totalAnswers}`);
    console.log(`   Database verification: ${finalCount[0].count} answers`);
    console.log(`   Processed rows: ${processedRows}/${records.length}`);
    console.log(`   Time elapsed: ${elapsed.toFixed(1)}s`);
    console.log(`   Rate: ${(totalAnswers / elapsed).toFixed(0)} answers/sec`);

    if (finalCount[0].count !== totalAnswers) {
      throw new Error(`Verification failed: Expected ${totalAnswers}, found ${finalCount[0].count}`);
    }

  } catch (error) {
    console.error(`\n❌ IMPORT FAILED:`, error.message);
    console.error(`   Stack trace:`, error.stack);
    process.exit(1);
  } finally {
    if (db) {
      await db.end();
      console.log('Database connection closed');
    }
  }
})(); 