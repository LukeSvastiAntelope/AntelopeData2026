// Trace the exact flow for correlation question
// Run this to understand each step the system takes

const mysql = require('mysql2/promise');

async function traceCorrelationFlow() {
  console.log('🔍 TRACING: "Can you find any correlation between peoples with high education and their views on the US?"');
  console.log('📋 Expected Flow:');
  console.log('  1. Understand the question and intent');
  console.log('  2. Look in survey schema for relevant questions');
  console.log('  3. Run SQL queries to get data');
  console.log('  4. Analyze data and create conclusion');
  console.log('  5. Show stats as graphs');
  console.log('');

  // Connect to database
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT || 3306
  });

  const surveyId = 81; // The Pew Research survey
  const userQuery = "Can you find any correlation between peoples with high education and their views on the US?";

  console.log('🎯 STEP 1: Understanding the question');
  console.log(`Query: "${userQuery}"`);
  console.log('Expected intent: ANALYZE + CORRELATION + COMPLEX');
  console.log('Expected topics: ["education", "US views", "opinions"]');
  console.log('');

  console.log('🔍 STEP 2: Looking at survey schema');
  console.log(`Survey ID: ${surveyId}`);
  
  // Get all questions in the survey
  const [allQuestions] = await db.execute(`
    SELECT 
      id,
      prompt,
      type,
      options,
      question_order
    FROM survey_questions 
    WHERE survey_id = ? 
    ORDER BY question_order ASC
  `, [surveyId]);

  console.log(`Total questions in survey: ${allQuestions.length}`);
  console.log('');

  console.log('📊 STEP 3: Question Analysis');
  console.log('Questions that could be relevant for correlation:');
  
  // Look for education-related questions
  const educationQuestions = allQuestions.filter(q => 
    q.prompt.toLowerCase().includes('education') || 
    q.prompt.toLowerCase().includes('school') ||
    q.prompt.toLowerCase().includes('college') ||
    q.prompt.toLowerCase().includes('degree')
  );
  
  console.log(`\n🎓 Education-related questions (${educationQuestions.length}):`);
  educationQuestions.forEach((q, i) => {
    console.log(`  ${i+1}. [ID: ${q.id}] ${q.prompt}`);
    console.log(`     Type: ${q.type}, Order: ${q.question_order}`);
  });

  // Look for US/America/government related questions
  const usQuestions = allQuestions.filter(q => 
    q.prompt.toLowerCase().includes('u.s.') || 
    q.prompt.toLowerCase().includes('united states') ||
    q.prompt.toLowerCase().includes('america') ||
    q.prompt.toLowerCase().includes('government') ||
    q.prompt.toLowerCase().includes('country') ||
    q.prompt.toLowerCase().includes('nation')
  );
  
  console.log(`\n🇺🇸 US/America-related questions (${usQuestions.length}):`);
  usQuestions.forEach((q, i) => {
    console.log(`  ${i+1}. [ID: ${q.id}] ${q.prompt}`);
    console.log(`     Type: ${q.type}, Order: ${q.question_order}`);
  });

  // Look for opinion/rating/view questions
  const opinionQuestions = allQuestions.filter(q => 
    q.prompt.toLowerCase().includes('opinion') || 
    q.prompt.toLowerCase().includes('think') ||
    q.prompt.toLowerCase().includes('feel') ||
    q.prompt.toLowerCase().includes('view') ||
    q.prompt.toLowerCase().includes('rate') ||
    q.prompt.toLowerCase().includes('how would you') ||
    q.type === 'rating'
  );
  
  console.log(`\n💭 Opinion/Rating questions (${opinionQuestions.length}):`);
  opinionQuestions.slice(0, 10).forEach((q, i) => {
    console.log(`  ${i+1}. [ID: ${q.id}] ${q.prompt}`);
    console.log(`     Type: ${q.type}, Order: ${q.question_order}`);
  });

  // Look for demographic questions
  const demoQuestions = allQuestions.filter(q => 
    q.prompt.toLowerCase().includes('what is your') || 
    q.prompt.toLowerCase().includes('demographic') ||
    q.prompt.toLowerCase().includes('age') ||
    q.prompt.toLowerCase().includes('gender') ||
    q.prompt.toLowerCase().includes('race') ||
    q.prompt.toLowerCase().includes('income')
  );
  
  console.log(`\n👥 Demographic questions (${demoQuestions.length}):`);
  demoQuestions.forEach((q, i) => {
    console.log(`  ${i+1}. [ID: ${q.id}] ${q.prompt}`);
    console.log(`     Type: ${q.type}, Order: ${q.question_order}`);
  });

  console.log('\n🤔 STEP 4: Analysis of Current Problem');
  console.log('For correlation analysis, we need:');
  console.log('  ✅ Education data (for filtering/grouping)');
  console.log('  ✅ US opinion data (for analysis)');
  console.log('  ✅ Way to join them (respondent_id)');
  
  if (educationQuestions.length === 0) {
    console.log('  ❌ NO education questions found!');
  }
  
  if (usQuestions.length === 0) {
    console.log('  ❌ NO US-related questions found!');
  }

  console.log('\n🔧 STEP 5: What the system SHOULD do');
  console.log('1. Find education demographic question for filtering');
  console.log('2. Find US opinion questions for analysis');
  console.log('3. Create SQL that joins both:');
  console.log('   - Group by education level (college+ vs non-college)');
  console.log('   - Show opinion distributions within each group');
  console.log('   - Calculate correlation statistics');
  
  await db.end();
}

// Load environment variables
require('dotenv').config();
traceCorrelationFlow().catch(console.error); 