// Usage: npx ts-node scripts/clone_survey_with_responses.ts

import { UserRepo } from '../src/app/utils/database/user-repo';
import { SurveyRepo } from '../src/app/utils/database/survey-repo';
import { openSql as getMySQLConnection } from '../src/app/utils/database/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

async function main() {
  const email = 'lukesvasti@gmail.com';
  const originalSurveyId = 81;
  const ipAddress = '127.0.0.1'; // anonymized
  const userAgent = 'cloned-script'; // anonymized

  console.log('Starting survey cloning process...');

  try {
    // 1. Get user ID
    console.log(`Looking up user: ${email}`);
    const user = await UserRepo.getUserByEmail(email);
    if (!user) {
      console.error('User not found:', email);
      process.exit(1);
    }
    const userId = user.id;
    console.log(`✅ User ID for ${email}: ${userId}`);

    // 2. Clone the survey
    console.log(`Cloning survey ${originalSurveyId}...`);
    const cloneResult = await SurveyRepo.cloneSurvey(originalSurveyId, userId);
    if (!cloneResult || !cloneResult.surveyId) {
      console.error('Failed to clone survey');
      process.exit(1);
    }
    const newSurveyId = cloneResult.surveyId;
    console.log(`✅ Cloned survey to new ID: ${newSurveyId}`);
    console.log(`✅ New survey title: ${cloneResult.title}`);
    console.log(`✅ New survey slug: ${cloneResult.slug}`);

    // 3. Map old question IDs to new ones
    console.log('Mapping question IDs...');
    const db = await getMySQLConnection();
    
    const [origQuestions] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC', 
      [originalSurveyId]
    );
    
    const [newQuestions] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY question_order ASC', 
      [newSurveyId]
    );

    if (origQuestions.length !== newQuestions.length) {
      console.error(`Mismatch in question count: original=${origQuestions.length}, clone=${newQuestions.length}`);
      process.exit(1);
    }

    // Map by order (questions should be in same order)
    const questionIdMap: { [key: number]: number } = {};
    for (let i = 0; i < origQuestions.length; i++) {
      questionIdMap[origQuestions[i].id] = newQuestions[i].id;
    }
    console.log(`✅ Mapped ${origQuestions.length} questions`);

    // 4. Fetch all responses from the original survey
    console.log('Fetching original survey responses...');
    const [responses] = await db.execute<RowDataPacket[]>(
      'SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY submitted_at ASC', 
      [originalSurveyId]
    );
    console.log(`Found ${responses.length} responses to copy`);

    let totalCopied = 0;
    let totalAnswers = 0;

    for (const resp of responses) {
      // Insert new response for the cloned survey
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO survey_responses (
          survey_id, demographics, anonymity_level, ip_address, user_agent, source, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newSurveyId,
          resp.demographics,
          resp.anonymity_level || 'full',
          ipAddress,
          userAgent,
          'cloned',
          resp.submitted_at
        ]
      );
      const newResponseId = result.insertId;

      // Fetch answers for this response
      const [answers] = await db.execute<RowDataPacket[]>(
        'SELECT * FROM survey_answers WHERE response_id = ?', 
        [resp.id]
      );

      let answersForThisResponse = 0;
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
        answersForThisResponse++;
        totalAnswers++;
      }

      totalCopied++;
      if (totalCopied % 100 === 0) {
        console.log(`Progress: ${totalCopied}/${responses.length} responses copied...`);
      }
    }

    console.log(`✅ Successfully copied ${totalCopied} responses with ${totalAnswers} answers to new survey.`);
    console.log(`✅ New survey ID: ${newSurveyId}`);
    console.log(`✅ New survey title: ${cloneResult.title}`);
    console.log(`✅ Analytics should now be visible for user: ${email}`);
    console.log(`✅ Survey URL slug: ${cloneResult.slug}`);

  } catch (error) {
    console.error('❌ Error in clone script:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
}); 