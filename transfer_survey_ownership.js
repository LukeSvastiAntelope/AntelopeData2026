const mysql = require('mysql2/promise');

async function transferSurveyOwnership() {
  const connection = await mysql.createConnection({
    host: 'antelopedb-do-user-18192858-0.j.db.ondigitalocean.com',
    port: 25060,
    user: 'doadmin',
    password: 'AVNS_Zobsi59qAR_OQ9QGwDd',
    database: 'defaultdb'
  });

  try {
    // Check current ownership
    const [currentSurvey] = await connection.execute(
      'SELECT id, title, created_by FROM surveys WHERE id = 12'
    );
    
    console.log('Current survey ownership:');
    console.log(currentSurvey[0]);
    
    // Transfer ownership to user ID 1
    const [result] = await connection.execute(
      'UPDATE surveys SET created_by = 1 WHERE id = 12'
    );
    
    console.log('Update result:', result);
    
    // Verify the change
    const [updatedSurvey] = await connection.execute(
      'SELECT id, title, created_by FROM surveys WHERE id = 12'
    );
    
    console.log('Updated survey ownership:');
    console.log(updatedSurvey[0]);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

transferSurveyOwnership(); 