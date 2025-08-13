const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Prefer ".env 2" if present per user instruction
const env2Path = path.join(process.cwd(), '.env 2');
if (fs.existsSync(env2Path)) {
  require('dotenv').config({ path: env2Path });
  console.log('🔧 Loaded environment from .env 2');
} else {
  require('dotenv').config();
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker', table, column]
  );
  return rows.length > 0;
}

async function runTwinPersonaMigration() {
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

    // responder_agents additions
    console.log('🛠  Checking responder_agents columns...');
    if (!(await columnExists(connection, 'responder_agents', 'persona_profile'))) {
      await connection.execute(`ALTER TABLE responder_agents ADD COLUMN persona_profile JSON NULL AFTER base_profile`);
      console.log('   ✅ Added responder_agents.persona_profile');
    } else console.log('   ✅ persona_profile exists');

    if (!(await columnExists(connection, 'responder_agents', 'capability_map'))) {
      await connection.execute(`ALTER TABLE responder_agents ADD COLUMN capability_map JSON NULL AFTER persona_profile`);
      console.log('   ✅ Added responder_agents.capability_map');
    } else console.log('   ✅ capability_map exists');

    if (!(await columnExists(connection, 'responder_agents', 'last_enriched_at'))) {
      await connection.execute(`ALTER TABLE responder_agents ADD COLUMN last_enriched_at DATETIME NULL AFTER capability_map`);
      console.log('   ✅ Added responder_agents.last_enriched_at');
    } else console.log('   ✅ last_enriched_at exists');

    if (!(await columnExists(connection, 'responder_agents', 'persona_version'))) {
      await connection.execute(`ALTER TABLE responder_agents ADD COLUMN persona_version INT NOT NULL DEFAULT 1 AFTER last_enriched_at`);
      console.log('   ✅ Added responder_agents.persona_version');
    } else console.log('   ✅ persona_version exists');

    // survey_responses additions
    console.log('🛠  Checking survey_responses columns...');
    if (!(await columnExists(connection, 'survey_responses', 'response_origin'))) {
      await connection.execute(`ALTER TABLE survey_responses ADD COLUMN response_origin ENUM('human','digital_twin') NOT NULL DEFAULT 'human' AFTER user_agent`);
      console.log('   ✅ Added survey_responses.response_origin');
    } else console.log('   ✅ response_origin exists');

    if (!(await columnExists(connection, 'survey_responses', 'twin_version'))) {
      await connection.execute(`ALTER TABLE survey_responses ADD COLUMN twin_version INT NULL AFTER response_origin`);
      console.log('   ✅ Added survey_responses.twin_version');
    } else console.log('   ✅ twin_version exists');

    if (!(await columnExists(connection, 'survey_responses', 'twin_match_score'))) {
      await connection.execute(`ALTER TABLE survey_responses ADD COLUMN twin_match_score FLOAT NULL AFTER twin_version`);
      console.log('   ✅ Added survey_responses.twin_match_score');
    } else console.log('   ✅ twin_match_score exists');

    console.log('\n🎉 Twin persona/capability migration completed');
  } catch (err) {
    console.error('❌ Migration failed:', err.message || err);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

if (require.main === module) {
  console.log('🚀 Running twin persona/capability migration...');
  runTwinPersonaMigration().then(() => {
    console.log('✅ Done');
    process.exit(0);
  });
}

module.exports = { runTwinPersonaMigration };


