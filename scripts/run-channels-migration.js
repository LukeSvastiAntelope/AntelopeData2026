#!/usr/bin/env node

/**
 * Run Channels Migration Script
 * Creates the required database tables for Telegram integration
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('🚀 Running Channels Migration...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root', 
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'market_maker',
      multipleStatements: true
    });
    
    console.log('✅ Connected to database');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/20250201_add_channels_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Executing migration SQL...');
    
    // Split and execute statements
    const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await connection.execute(statement);
          console.log('✅ Executed statement');
        } catch (err) {
          if (err.message.includes('already exists')) {
            console.log('ℹ️  Table already exists, skipping');
          } else {
            console.error('❌ Error executing statement:', err.message);
          }
        }
      }
    }
    
    console.log('\n🔍 Verifying tables were created...');
    
    const tables = ['user_channel_integrations', 'survey_channels', 'survey_channel_sessions'];
    
    for (const table of tables) {
      const [rows] = await connection.execute(`SHOW TABLES LIKE '${table}'`);
      if (rows.length > 0) {
        console.log(`✅ ${table} - OK`);
      } else {
        console.log(`❌ ${table} - MISSING`);
      }
    }
    
    await connection.end();
    console.log('\n✅ Migration completed successfully!');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('\nPlease check:');
    console.error('1. Database connection settings in .env');
    console.error('2. Database permissions');
    console.error('3. MySQL version compatibility');
    process.exit(1);
  }
}

if (require.main === module) {
  console.log('🔧 Channels Database Migration\n');
  console.log('===============================\n');
  runMigration().catch(console.error);
}

module.exports = { runMigration };
