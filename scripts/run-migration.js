#!/usr/bin/env node

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  try {
    const migrationFile = process.argv[2] || '20250123_add_report_generation_tables.sql';
    const migrationPath = path.join(__dirname, '..', 'migrations', migrationFile);
    
    console.log(`📄 Running migration: ${migrationFile}`);
    console.log(`📁 Path: ${migrationPath}`);
    
    const migration = fs.readFileSync(migrationPath, 'utf8');
    
    await connection.query(migration);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify tables were created
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('reports', 'report_sections', 'report_embeddings')
    `, [process.env.MYSQL_DATABASE]);
    
    console.log('📊 Created tables:', tables.map(t => t.TABLE_NAME).join(', '));
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
  } finally {
    await connection.end();
  }
}

runMigration(); 