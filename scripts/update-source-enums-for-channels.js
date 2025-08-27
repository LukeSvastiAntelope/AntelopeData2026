const mysql = require('mysql2/promise');
require('dotenv').config();

(async function main() {
  const host = process.env.MYSQL_HOST || process.env.DB_HOST;
  const user = process.env.MYSQL_USER || process.env.DB_USER;
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD;
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);

  const ssl = {
    // DigitalOcean MySQL often requires SSL with self-signed certs
    rejectUnauthorized: false,
  };

  const channelSources = [
    'native', 'import', 'api',
    'web', 'telegram', 'email', 'sms', 'discord', 'whatsapp',
  ];

  const surveySources = [
    // existing import-oriented values
    'native', 'csv_import', 'excel_import', 'surveymonkey_import', 'typeform_import', 'google_forms_import', 'google_sheets_import',
    // plus channels for completeness if we ever tag surveys by channel
    'web', 'telegram', 'email', 'sms', 'discord', 'whatsapp',
  ];

  let connection;
  try {
    connection = await mysql.createConnection({ host, user, password, database, port, ssl });
    console.log('✅ Connected to DB', { host, database });

    // Ensure survey_responses.source supports channel values
    const srEnum = `ENUM(${channelSources.map(v => `'${v}'`).join(', ')})`;
    const alterResponses = `ALTER TABLE survey_responses MODIFY COLUMN source ${srEnum} DEFAULT 'native'`;
    await connection.execute(alterResponses);
    console.log('✅ Updated survey_responses.source enum');

    // Ensure surveys.source also includes channel values (safe broader enum)
    const sEnum = `ENUM(${surveySources.map(v => `'${v}'`).join(', ')})`;
    const alterSurveys = `ALTER TABLE surveys MODIFY COLUMN source ${sEnum} DEFAULT 'native'`;
    try {
      await connection.execute(alterSurveys);
      console.log('✅ Updated surveys.source enum');
    } catch (e) {
      console.warn('⚠️ Could not update surveys.source enum (may not exist yet):', e.code || e.message);
    }

    console.log('🎉 Source enums updated successfully.');
  } catch (err) {
    console.error('❌ Failed to update source enums:', err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
})();






