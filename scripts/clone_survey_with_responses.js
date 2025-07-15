// Usage: node scripts/clone_survey_with_responses.js

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env 2' });

async function main() {
  const email = 'lukesvasti@gmail.com';
  const originalSurveyId = 81;
  const ipAddress = '127.0.0.1'; // anonymized
  const userAgent = 'cloned-script'; // anonymized

  let db;
  console.log('Starting survey cloning process...');

  try {
    // Connect to database
    console.log('Connecting to database...');
    db = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
    console.log('✅ Database connected');

    // 1. Get user ID
    console.log(`Looking up user: ${email}`);
    const [userRows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (!userRows[0]) {
      console.error('User not found:', email);
      process.exit(1);
    }
    const userId = userRows[0].id;
    console.log(`✅ User ID for ${email}: ${userId}`);

    // 2. Check if original survey exists
    console.log(`Checking if survey ${originalSurveyId} exists...`);
    const [surveyRows] = await db.execute('SELECT * FROM surveys WHERE id = ?', [originalSurveyId]);
    if (!surveyRows[0]) {
      console.error(`Survey ${originalSurveyId} not found`);
      process.exit(1);
    }
    const originalSurvey = surveyRows[0];
    console.log(`✅ Found original survey: "${originalSurvey.title}"`);

    // 3. Clone the survey (manual implementation)
    console.log(`Cloning survey ${originalSurveyId}...`);
    
    // Generate new title and slug
    const newTitle = `Copy of ${originalSurvey.title}`;
    const baseSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
    const uniqueId = Math.random().toString(36).substring(2, 10);
    const newSlug = `${baseSlug}-${uniqueId}`;

    // Insert cloned survey
    const [cloneResult] = await db.execute(
      `INSERT INTO surveys (
        title, description, slug, created_by, is_public, status, 
        start_at, end_at, source, source_metadata
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 'clone', ?)`,
      [
        newTitle,
        originalSurvey.description,
        newSlug,
        userId,
        originalSurvey.is_public,
        null, // start_at - reset to null
        null, // end_at - reset to null
        JSON.stringify({
          originalSurveyId: originalSurveyId,
          originalTitle: originalSurvey.title,
          clonedAt: new Date().toISOString(),
          clonedBy: userId
        })
      ]
    );
    const newSurveyId = cloneResult.insertId;
    console.log(`✅ Cloned survey to new ID: ${newSurveyId}`);
    console.log(`✅ New survey title: ${newTitle}`);
    console.log(`✅ New survey slug: ${newSlug}`);

    // 4. Clone questions
    console.log('Cloning questions...');
    const [origQuestions] = await db.execute(
      'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC', 
      [originalSurveyId]
    );

    const questionIdMap = {};
    for (const question of origQuestions) {
      const [questionResult] = await db.execute(
        `INSERT INTO survey_questions (
          survey_id, type, prompt, options, is_required, question_order
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          newSurveyId,
          question.type,
          question.prompt,
          question.options,
          question.is_required,
          question.question_order
        ]
      );
      questionIdMap[question.id] = questionResult.insertId;
    }
    console.log(`✅ Cloned ${origQuestions.length} questions`);

    // 5. Clone responses and answers
    console.log('Fetching original survey responses...');
    const [responses] = await db.execute(
      'SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY submitted_at ASC', 
      [originalSurveyId]
    );
    console.log(`Found ${responses.length} responses to copy`);

    let totalCopied = 0;
    let totalAnswers = 0;

    for (const resp of responses) {
      // Insert new response for the cloned survey
              const [result] = await db.execute(
          `INSERT INTO survey_responses (
            survey_id, demographics, anonymity_level, ip_address, user_agent, submitted_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            newSurveyId,
            resp.demographics,
            resp.anonymity_level || 'full',
            ipAddress,
            userAgent,
            resp.submitted_at
          ]
        );
      const newResponseId = result.insertId;

      // Fetch answers for this response
      const [answers] = await db.execute(
        'SELECT * FROM survey_answers WHERE response_id = ?', 
        [resp.id]
      );

      for (const ans of answers) {
        const newQuestionId = questionIdMap[ans.question_id];
        if (!newQuestionId) {
          console.warn(`⚠️  Skipping answer for unmapped question ID: ${ans.question_id}`);
          continue;
        }
        
        await db.execute(
          'INSERT INTO survey_answers (response_id, question_id, answer_value) VALUES (?, ?, ?)',
          [newResponseId, newQuestionId, ans.answer_value]
        );
        totalAnswers++;
      }

      totalCopied++;
      if (totalCopied % 100 === 0) {
        console.log(`Progress: ${totalCopied}/${responses.length} responses copied...`);
      }
    }

    console.log(`✅ Successfully copied ${totalCopied} responses with ${totalAnswers} answers to new survey.`);
    console.log(`✅ New survey ID: ${newSurveyId}`);
    console.log(`✅ New survey title: ${newTitle}`);
    console.log(`✅ Analytics should now be visible for user: ${email}`);
    console.log(`✅ Survey URL slug: ${newSlug}`);

  } catch (error) {
    console.error('❌ Error in clone script:', error);
    process.exit(1);
  } finally {
    if (db) {
      await db.end();
      console.log('Database connection closed');
    }
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
}); 