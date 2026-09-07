const mysql = require('mysql2/promise');
require('dotenv').config();

async function runSourceTrackingMigration() {
  let connection;
  
  try {
    // Create database connection using environment variables
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || process.env.DB_HOST,
      user: process.env.MYSQL_USER || process.env.DB_USER,
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker',
      port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
      ssl: {
        // DigitalOcean requires SSL but uses self-signed certificates
        rejectUnauthorized: false
      }
    });

    console.log('✅ Connected to DigitalOcean database...');

    // Check if source column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'surveys' AND COLUMN_NAME = 'source'
    `, [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker']);

    if (columns.length > 0) {
      console.log('✅ Source tracking columns already exist. Migration already completed.');
      return;
    }

    console.log('📝 Starting source tracking migration...\n');

    // Add source tracking to surveys table
    console.log('1️⃣ Adding source tracking to surveys table...');
    await connection.execute(`
      ALTER TABLE surveys 
      ADD COLUMN source ENUM('native', 'csv_import', 'excel_import', 'surveymonkey_import', 'typeform_import', 'google_forms_import', 'google_sheets_import') DEFAULT 'native' AFTER status,
      ADD COLUMN source_metadata JSON NULL AFTER source
    `);
    console.log('   ✅ Added surveys.source and surveys.source_metadata columns');

    // Add source tracking to survey_responses table
    console.log('\n2️⃣ Adding source tracking to survey_responses table...');
    
    // Check if source column exists
    const [sourceColsResponse] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'survey_responses' AND COLUMN_NAME = 'source'
    `, [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker']);
    
    if (sourceColsResponse.length === 0) {
      await connection.execute(`
        ALTER TABLE survey_responses
        ADD COLUMN source ENUM('native', 'import', 'api') DEFAULT 'native' AFTER user_agent
      `);
      console.log('   ✅ Added survey_responses.source column');
    } else {
      console.log('   ✅ survey_responses.source column already exists');
    }
    
    // Check if agent_token column exists
    const [agentTokenCols] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'survey_responses' AND COLUMN_NAME = 'agent_token'
    `, [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker']);
    
    if (agentTokenCols.length === 0) {
      await connection.execute(`
        ALTER TABLE survey_responses
        ADD COLUMN agent_token VARCHAR(255) NULL AFTER source
      `);
      console.log('   ✅ Added survey_responses.agent_token column');
    } else {
      console.log('   ✅ survey_responses.agent_token column already exists');
    }

    // Add indexes for source queries
    console.log('\n3️⃣ Adding indexes for better query performance...');
    
    try {
      await connection.execute('ALTER TABLE surveys ADD INDEX idx_source (source)');
      console.log('   ✅ Added index on surveys.source');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('   ✅ Index on surveys.source already exists');
      } else throw e;
    }
    
    try {
      await connection.execute('ALTER TABLE survey_responses ADD INDEX idx_source (source)');
      console.log('   ✅ Added index on survey_responses.source');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('   ✅ Index on survey_responses.source already exists');
      } else throw e;
    }
    
    try {
      await connection.execute('ALTER TABLE survey_responses ADD INDEX idx_agent_token (agent_token)');
      console.log('   ✅ Added index on survey_responses.agent_token');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('   ✅ Index on survey_responses.agent_token already exists');
      } else throw e;
    }

    // Check if email column already exists in responder_agents
    console.log('\n4️⃣ Checking responder_agents table...');
    const [emailColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'responder_agents' AND COLUMN_NAME = 'email'
    `, [process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker']);

    if (emailColumns.length === 0) {
      console.log('   Adding email column to responder_agents table...');
      await connection.execute(`
        ALTER TABLE responder_agents 
        ADD COLUMN email VARCHAR(255) NULL AFTER agent_token
      `);
      
      await connection.execute('ALTER TABLE responder_agents ADD INDEX idx_email (email)');
      console.log('   ✅ Added responder_agents.email column and index');
    } else {
      console.log('   ✅ Email column already exists in responder_agents table');
    }

    console.log('\n🎉 Source tracking migration completed successfully!\n');
    console.log('Summary of changes:');
    console.log('  • surveys.source - tracks import source (native, csv_import, etc.)');
    console.log('  • surveys.source_metadata - stores import metadata (filenames, etc.)');
    console.log('  • survey_responses.source - tracks response source');
    console.log('  • survey_responses.agent_token - links responses to digital twins');
    console.log('  • responder_agents.email - enables digital twin deduplication');
    console.log('\n✨ The import feature now has full source tracking enabled!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    
    // Provide helpful error messages
    if (error.code === 'ER_DUP_FIELDNAME' || error.message.includes('Duplicate column name')) {
      console.log('\n✅ Some columns already exist. This is okay - migration partially completed.');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n🔌 Could not connect to database. Please check your connection settings.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n🔐 Access denied. Please check your database credentials.');
    } else {
      console.log('\n💡 Error details:', error);
    }
    
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed.');
    }
  }
}

// Run the migration
console.log('🚀 Starting source tracking migration for survey import feature...\n');

runSourceTrackingMigration()
  .then(() => {
    console.log('\n✅ Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed.');
    process.exit(1);
  }); 