require('dotenv').config({ path: '.env.local' });
const mysql = require('mysql2/promise');

async function fixColumn() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });
    
    await connection.execute('ALTER TABLE user_channel_integrations MODIFY COLUMN encrypted_credentials TEXT NOT NULL');
    console.log('✅ Fixed encrypted_credentials column type from JSON to TEXT');
    await connection.end();
  } catch (error) {
    console.error('❌ Error fixing column:', error);
    process.exit(1);
  }
}

fixColumn();
