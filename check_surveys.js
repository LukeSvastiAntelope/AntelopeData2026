const mysql = require('mysql2/promise');

async function checkSurveys() {
  const connection = await mysql.createConnection({
    host: 'antelopedb-do-user-18192858-0.j.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_Zobsi59qAR_OQ9QGwDd',
    database: 'defaultdb'
  });

  try {
    // Check all surveys
    const [surveys] = await connection.execute(
      'SELECT id, title, created_by, created_at, status FROM surveys ORDER BY created_at DESC'
    );
    
    console.log('All surveys in database:');
    console.log('ID | Title | Created By | Created At | Status');
    console.log('---|-------|------------|------------|-------');
    
    surveys.forEach(survey => {
      console.log(`${survey.id} | ${survey.title} | ${survey.created_by} | ${survey.created_at} | ${survey.status}`);
    });
    
    // Check for Red Pill survey specifically
    const [redPillSurveys] = await connection.execute(
      "SELECT * FROM surveys WHERE title LIKE '%red pill%' OR title LIKE '%Red Pill%'"
    );
    
    console.log('\nRed Pill surveys found:');
    redPillSurveys.forEach(survey => {
      console.log(`ID: ${survey.id}, Title: ${survey.title}, Created By: ${survey.created_by}`);
    });
    
    // Check user table to see current users
    const [users] = await connection.execute(
      'SELECT id, email, display_name FROM users ORDER BY id'
    );
    
    console.log('\nUsers in database:');
    console.log('ID | Email | Display Name');
    console.log('---|-------|-------------');
    users.forEach(user => {
      console.log(`${user.id} | ${user.email} | ${user.display_name || 'NULL'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

checkSurveys(); 