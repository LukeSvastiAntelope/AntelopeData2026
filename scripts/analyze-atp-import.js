const mysql = require('mysql2/promise');
require('dotenv').config();

async function analyzeATPImport() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    
    console.log('🔍 COMPREHENSIVE ATP W142 IMPORT ANALYSIS');
    console.log('==========================================\n');
    
    // Find the ATP surveys
    const [surveys] = await connection.execute(
      `SELECT * FROM surveys WHERE title LIKE "%ATP%" ORDER BY created_at DESC LIMIT 2`
    );
    
    console.log('📋 ATP Surveys Found:');
    surveys.forEach(survey => {
      console.log(`- ID: ${survey.id}, Title: "${survey.title}"`);
      console.log(`  Status: ${survey.status}, Created: ${survey.created_at}`);
      console.log(`  Source: ${survey.source}`);
      if (survey.source_metadata) {
        const metadata = JSON.parse(survey.source_metadata);
        console.log(`  Original File: ${metadata.originalFileName}, Expected Rows: ${metadata.totalRows}`);
      }
      console.log('');
    });
    
    if (surveys.length === 0) {
      console.log('❌ No ATP surveys found');
      await connection.end();
      return;
    }
    
    const survey = surveys[0]; // Most recent "Imported Survey - ATP W142"
    console.log(`🎯 Analyzing: "${survey.title}" (ID: ${survey.id})\n`);
    
    // 1. Check Questions Structure
    console.log('📝 QUESTION ANALYSIS:');
    console.log('====================');
    
    const [questions] = await connection.execute(
      'SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY `order`',
      [survey.id]
    );
    
    console.log(`Total Questions: ${questions.length}`);
    
    // Analyze question types
    const questionTypes = {};
    questions.forEach(q => {
      questionTypes[q.type] = (questionTypes[q.type] || 0) + 1;
    });
    
    console.log('Question Type Distribution:');
    Object.entries(questionTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} questions`);
    });
    
    // Check for problematic question names
    console.log('\nFirst 10 Questions:');
    questions.slice(0, 10).forEach((q, i) => {
      console.log(`  ${i + 1}. "${q.prompt}" (${q.type})`);
      if (q.options) {
        const options = JSON.parse(q.options);
        console.log(`     Options (${options.length}): [${options.slice(0, 3).join(', ')}${options.length > 3 ? '...' : ''}]`);
      }
    });
    
    // 2. Check Responses
    console.log('\n\n👥 RESPONSE ANALYSIS:');
    console.log('=====================');
    
    const [responseCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = ?',
      [survey.id]
    );
    
    console.log(`Total Responses: ${responseCount[0].count}`);
    
    // Check demographics quality
    const [demoStats] = await connection.execute(`
      SELECT 
        SUM(CASE WHEN demographics IS NULL OR demographics = '{}' THEN 1 ELSE 0 END) as empty_demographics,
        SUM(CASE WHEN JSON_EXTRACT(demographics, '$.age') IS NOT NULL THEN 1 ELSE 0 END) as has_age,
        SUM(CASE WHEN JSON_EXTRACT(demographics, '$.location') IS NOT NULL THEN 1 ELSE 0 END) as has_location,
        SUM(CASE WHEN JSON_EXTRACT(demographics, '$.occupation') IS NOT NULL THEN 1 ELSE 0 END) as has_occupation,
        COUNT(*) as total
      FROM survey_responses 
      WHERE survey_id = ?
    `, [survey.id]);
    
    const demo = demoStats[0];
    console.log('\nDemographics Quality:');
    console.log(`  Empty demographics: ${demo.empty_demographics}/${demo.total} (${Math.round(demo.empty_demographics/demo.total*100)}%)`);
    console.log(`  Has age: ${demo.has_age}/${demo.total} (${Math.round(demo.has_age/demo.total*100)}%)`);
    console.log(`  Has location: ${demo.has_location}/${demo.total} (${Math.round(demo.has_location/demo.total*100)}%)`);
    console.log(`  Has occupation: ${demo.has_occupation}/${demo.total} (${Math.round(demo.has_occupation/demo.total*100)}%)`);
    
    // Sample demographics
    const [sampleResponses] = await connection.execute(
      'SELECT demographics FROM survey_responses WHERE survey_id = ? AND demographics IS NOT NULL AND demographics != "{}" LIMIT 3',
      [survey.id]
    );
    
    console.log('\nSample Demographics:');
    sampleResponses.forEach((resp, i) => {
      const demo = JSON.parse(resp.demographics);
      console.log(`  ${i + 1}. Age: ${demo.age || 'N/A'}, Location: ${demo.location || 'N/A'}, Occupation: ${demo.occupation || 'N/A'}`);
    });
    
    // 3. Check Answers
    console.log('\n\n📊 ANSWER ANALYSIS:');
    console.log('===================');
    
    const [answerCount] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM survey_answers sa 
      JOIN survey_questions sq ON sa.question_id = sq.id 
      WHERE sq.survey_id = ?
    `, [survey.id]);
    
    console.log(`Total Answers: ${answerCount[0].count}`);
    
    // Check answer distribution per question
    const [answerDist] = await connection.execute(`
      SELECT 
        sq.prompt,
        sq.type,
        COUNT(sa.id) as answer_count,
        COUNT(DISTINCT sa.response_id) as unique_responses
      FROM survey_questions sq
      LEFT JOIN survey_answers sa ON sq.id = sa.question_id
      WHERE sq.survey_id = ?
      GROUP BY sq.id, sq.prompt, sq.type
      ORDER BY answer_count DESC
      LIMIT 10
    `, [survey.id]);
    
    console.log('\nTop 10 Questions by Answer Count:');
    answerDist.forEach((q, i) => {
      console.log(`  ${i + 1}. "${q.prompt}" (${q.type}): ${q.answer_count} answers from ${q.unique_responses} responses`);
    });
    
    // Check for questions with no answers
    const [unanswered] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM survey_questions sq
      WHERE sq.survey_id = ? 
      AND NOT EXISTS (SELECT 1 FROM survey_answers sa WHERE sa.question_id = sq.id)
    `, [survey.id]);
    
    console.log(`\nQuestions with no answers: ${unanswered[0].count}`);
    
    // 4. Sample actual answers
    console.log('\n\n🔍 SAMPLE ANSWERS:');
    console.log('==================');
    
    const [sampleAnswers] = await connection.execute(`
      SELECT sq.prompt, sa.value, sa.response_id
      FROM survey_answers sa
      JOIN survey_questions sq ON sa.question_id = sq.id
      WHERE sq.survey_id = ?
      ORDER BY RAND()
      LIMIT 10
    `, [survey.id]);
    
    sampleAnswers.forEach((answer, i) => {
      console.log(`  ${i + 1}. "${answer.prompt}": "${answer.value}" (Response ${answer.response_id})`);
    });
    
    // 5. Identify Issues
    console.log('\n\n🚨 IDENTIFIED ISSUES:');
    console.log('=====================');
    
    const issues = [];
    
    // Issue 1: Question names are technical codes
    if (questions.some(q => q.prompt.includes('_W142') || q.prompt.match(/^[A-Z_]+$/))) {
      issues.push('❌ Question names are technical codes (e.g., "QKEY", "DEVICE_TYPE_W142") instead of human-readable questions');
    }
    
    // Issue 2: Poor demographics
    if (demo.empty_demographics / demo.total > 0.5) {
      issues.push(`❌ ${Math.round(demo.empty_demographics/demo.total*100)}% of responses have missing demographics`);
    }
    
    // Issue 3: Question types might be wrong
    const suspiciousTypes = Object.entries(questionTypes).filter(([type, count]) => 
      type === 'number' && count > questions.length * 0.3
    );
    if (suspiciousTypes.length > 0) {
      issues.push(`❌ Too many questions marked as "number" type (${suspiciousTypes[0][1]} questions) - likely should be single-choice`);
    }
    
    // Issue 4: Check if this is raw survey data vs responses
    if (questions.length > 50 && questions.some(q => q.prompt.startsWith('F_'))) {
      issues.push('❌ This appears to be raw survey metadata/weights rather than actual survey questions');
    }
    
    if (issues.length === 0) {
      console.log('✅ No major issues detected');
    } else {
      issues.forEach(issue => console.log(issue));
    }
    
    // 6. Recommendations
    console.log('\n\n💡 RECOMMENDATIONS:');
    console.log('===================');
    
    console.log('1. 🔄 Re-import with proper column mapping:');
    console.log('   - Map technical codes to human-readable question text');
    console.log('   - Ensure demographic fields are properly identified');
    console.log('   - Set correct question types (single-choice vs number vs text)');
    
    console.log('\n2. 📋 Check original CSV structure:');
    console.log('   - Verify if first row contains actual questions or just column codes');
    console.log('   - Look for a separate codebook or question mapping');
    
    console.log('\n3. 🎯 Focus on survey content:');
    console.log('   - Filter out metadata columns (F_*, WEIGHT_*, technical IDs)');
    console.log('   - Include only actual survey questions participants answered');
    
    await connection.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

analyzeATPImport(); 