const mysql = require('mysql2/promise');
require('dotenv').config();

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker', table, column]
  );
  return rows.length > 0;
}

async function runSurveyMediaMigration() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || process.env.DB_HOST,
      user: process.env.MYSQL_USER || process.env.DB_USER,
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker',
      port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
      ssl: { rejectUnauthorized: false }
    });

    console.log('✅ Connected to database');

    const table = 'survey_questions';

    const hasMedia = await columnExists(connection, table, 'media');
    const hasOptionMedia = await columnExists(connection, table, 'option_media');

    if (hasMedia && hasOptionMedia) {
      console.log('✅ Columns media and option_media already exist');
      return;
    }

    console.log('🛠 Applying media columns migration...');

    // Add columns individually to be safe across MySQL variants
    if (!hasMedia) {
      await connection.execute(`ALTER TABLE ${table} ADD COLUMN media JSON NULL AFTER options`);
      console.log('   ✅ Added survey_questions.media');
    }
    if (!hasOptionMedia) {
      await connection.execute(`ALTER TABLE ${table} ADD COLUMN option_media JSON NULL AFTER media`);
      console.log('   ✅ Added survey_questions.option_media');
    }

    console.log('🎉 Survey media migration completed');
  } catch (err) {
    console.error('❌ Migration failed:', err?.message || err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

if (require.main === module) {
  runSurveyMediaMigration();
}

module.exports = { runSurveyMediaMigration };













