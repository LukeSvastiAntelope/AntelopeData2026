const mysql = require('mysql2/promise')

const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0,
    maxIdle: 10,
    idleTimeout: 30000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    acquireTimeout: 60000,
    timeout: 60000
}

async function fixColumn() {
  try {
    const pool = mysql.createPool(connectionParams)
    await pool.execute('ALTER TABLE user_channel_integrations MODIFY COLUMN encrypted_credentials TEXT NOT NULL')
    console.log('✅ Fixed encrypted_credentials column type from JSON to TEXT')
    await pool.end()
  } catch (error) {
    console.error('❌ Error fixing column:', error.message)
    process.exit(1)
  }
}

fixColumn()
