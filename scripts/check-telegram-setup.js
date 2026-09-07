#!/usr/bin/env node

/**
 * Check Telegram Integration Setup
 * Diagnoses missing environment variables and database tables for Telegram integration
 */

const mysql = require('mysql2/promise');

async function checkEnvironmentVariables() {
  console.log('🔍 Checking Environment Variables...\n');
  
  const required = [
    'PUBLIC_BASE_URL',
    'SECURE_STORAGE_KEY',
    'TELEGRAM_WEBHOOK_SECRET'
  ];
  
  const optional = [
    'NEXT_PUBLIC_APP_URL',
    'TELEGRAM_DEBUG',
    'TELEGRAM_TEST_MODE'
  ];
  
  const missing = [];
  const present = [];
  
  required.forEach(key => {
    if (process.env[key]) {
      present.push(`✅ ${key}: ${process.env[key].length > 20 ? process.env[key].substring(0,20) + '...' : process.env[key]}`);
    } else {
      missing.push(`❌ ${key}: NOT SET`);
    }
  });
  
  optional.forEach(key => {
    if (process.env[key]) {
      present.push(`🔹 ${key}: ${process.env[key]}`);
    } else {
      missing.push(`🔸 ${key}: not set (optional)`);
    }
  });
  
  console.log('Present:');
  present.forEach(msg => console.log(msg));
  console.log('\nMissing:');
  missing.forEach(msg => console.log(msg));
  
  return missing.filter(m => m.includes('❌')).length === 0;
}

async function checkDatabaseTables() {
  console.log('\n🗄️  Checking Database Tables...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'market_maker'
    });
    
    const requiredTables = [
      'user_channel_integrations',
      'survey_channels', 
      'survey_channel_sessions'
    ];
    
    for (const table of requiredTables) {
      try {
        const [rows] = await connection.execute(`SHOW TABLES LIKE '${table}'`);
        if (rows.length > 0) {
          console.log(`✅ Table '${table}' exists`);
          
          // Check table structure
          const [columns] = await connection.execute(`DESCRIBE ${table}`);
          console.log(`   Columns: ${columns.map(c => c.Field).join(', ')}`);
        } else {
          console.log(`❌ Table '${table}' missing`);
        }
      } catch (err) {
        console.log(`❌ Error checking table '${table}': ${err.message}`);
      }
    }
    
    await connection.end();
    return true;
  } catch (err) {
    console.log(`❌ Database connection failed: ${err.message}`);
    console.log('Check your database environment variables:');
    console.log('  - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    return false;
  }
}

async function generateSecureKey() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

async function main() {
  console.log('🔧 Telegram Integration Setup Checker\n');
  console.log('==================================\n');
  
  const envOk = await checkEnvironmentVariables();
  const dbOk = await checkDatabaseTables();
  
  console.log('\n📋 Summary & Recommendations:\n');
  
  if (!envOk) {
    console.log('❌ Environment Configuration Issues:');
    console.log('');
    console.log('Add these to your .env file or deployment environment:');
    console.log('');
    console.log('# Required for Telegram Integration');
    console.log('PUBLIC_BASE_URL=https://your-domain.com');
    console.log('NEXT_PUBLIC_APP_URL=https://your-domain.com');
    console.log(`SECURE_STORAGE_KEY=${await generateSecureKey()}`);
    console.log(`TELEGRAM_WEBHOOK_SECRET=${await generateSecureKey()}`);
    console.log('');
    console.log('# Optional for debugging');
    console.log('TELEGRAM_DEBUG=0');
    console.log('TELEGRAM_TEST_MODE=0');
    console.log('');
  }
  
  if (!dbOk) {
    console.log('❌ Database Issues:');
    console.log('');
    console.log('Run the migration to create required tables:');
    console.log('node scripts/create_channels_tables.js');
    console.log('');
  }
  
  if (envOk && dbOk) {
    console.log('✅ All checks passed! Telegram integration should work.');
  }
  
  console.log('\n🚀 Next Steps:');
  console.log('1. Fix any issues above');
  console.log('2. Restart your application');
  console.log('3. Test /channels/new?provider=telegram');
  console.log('4. Create a Telegram bot via @BotFather');
  console.log('5. Get the bot token and test the connection');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkEnvironmentVariables, checkDatabaseTables };
