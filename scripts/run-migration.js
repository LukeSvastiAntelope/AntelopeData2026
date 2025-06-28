#!/usr/bin/env node

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env 2' });

async function runMigration() {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'marketmaker',
      multipleStatements: true // Allow multiple SQL statements
    });

    console.log('📊 Connected to database');

    // Check current survey status distribution
    const [beforeResults] = await connection.execute(
      'SELECT status, COUNT(*) as count FROM surveys GROUP BY status'
    );
    console.log('\n📈 Current survey status distribution:');
    console.table(beforeResults);

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '20250701_add_schedule_fields_safe.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n🔄 Running migration...');
    
    // Execute migration
    await connection.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');

    // Check results after migration
    const [afterResults] = await connection.execute(
      'SELECT status, COUNT(*) as count FROM surveys GROUP BY status'
    );
    console.log('\n📊 New survey status distribution:');
    console.table(afterResults);

    // Show table structure
    const [columns] = await connection.execute(
      "SHOW COLUMNS FROM surveys WHERE Field IN ('status', 'start_at', 'end_at', 'archived_at')"
    );
    console.log('\n📋 Updated table structure:');
    console.table(columns);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n👋 Database connection closed');
    }
  }
}

// Run the migration
runMigration(); 