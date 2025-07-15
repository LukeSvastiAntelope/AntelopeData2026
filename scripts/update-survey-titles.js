require('dotenv').config();
const mysql = require('mysql2/promise');

// UPDATE THESE VALUES ONCE YOU IDENTIFY THE CORRECT SURVEY IDs
const ATP_SURVEY_ID = null; // Replace with the actual ATP W142 survey ID
const OLD_DEFAULT_ID = 49;   // Current default survey ID

const NEW_TITLE = 'Social Media Use in 2021 (Pew Research - Synthetic)';
const OLD_TITLE = 'Social Media Use in 2021 (Pew Research - Synthetic) - Legacy 200 Responses';

async function updateSurveyTitles() {
  if (!ATP_SURVEY_ID) {
    console.log('❌ Please update ATP_SURVEY_ID in this script first!');
    console.log('');
    console.log('📝 TO FIND THE ATP SURVEY ID:');
    console.log('1. Go to http://localhost:3000/surveys in your browser');
    console.log('2. Look for "Imported Survey - ATP W142" or similar');
    console.log('3. Note the survey ID from the URL or interface');
    console.log('4. Update ATP_SURVEY_ID in this script');
    console.log('5. Run this script again');
    return;
  }

  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    
    console.log('🔄 UPDATING SURVEY TITLES');
    console.log('=========================\n');
    
    // Update ATP survey title to be the new default
    await connection.execute(
      'UPDATE surveys SET title = ? WHERE id = ?',
      [NEW_TITLE, ATP_SURVEY_ID]
    );
    console.log(`✅ Updated survey ${ATP_SURVEY_ID} title to: "${NEW_TITLE}"`);
    
    // Update old default survey title
    await connection.execute(
      'UPDATE surveys SET title = ? WHERE id = ?',
      [OLD_TITLE, OLD_DEFAULT_ID]
    );
    console.log(`✅ Updated survey ${OLD_DEFAULT_ID} title to: "${OLD_TITLE}"`);
    
    // Verify changes
    const [newDefault] = await connection.execute(
      'SELECT id, title, response_count FROM surveys WHERE id = ?',
      [ATP_SURVEY_ID]
    );
    
    const [oldDefault] = await connection.execute(
      'SELECT id, title, response_count FROM surveys WHERE id = ?',
      [OLD_DEFAULT_ID]
    );
    
    console.log('\n🔍 VERIFICATION:');
    console.log('================');
    console.log('New default survey:');
    console.log(`- ID: ${newDefault[0].id}`);
    console.log(`- Title: ${newDefault[0].title}`);
    console.log(`- Responses: ${newDefault[0].response_count}`);
    console.log('');
    console.log('Old survey (renamed):');
    console.log(`- ID: ${oldDefault[0].id}`);
    console.log(`- Title: ${oldDefault[0].title}`);
    console.log(`- Responses: ${oldDefault[0].response_count}`);
    
    console.log('\n✅ Survey title updates completed successfully!');
    console.log(`📊 New default survey has ${newDefault[0].response_count} respondents`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

updateSurveyTitles(); 