// Check users table structure
const mysql = require('mysql2/promise');
require('dotenv').config();

const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
};

async function checkUsersTable() {
    let connection;
    
    try {
        console.log('🔌 Connecting to database...');
        connection = await mysql.createConnection(connectionParams);
        
        console.log('✅ Connected to database successfully!');
        
        // Check users table structure
        console.log('\n📋 Users table structure:');
        const [rows] = await connection.execute('DESCRIBE users');
        console.table(rows);
        
        // Check if users table exists and has data
        const [countResult] = await connection.execute('SELECT COUNT(*) as count FROM users');
        console.log(`\n👥 Users table has ${countResult[0].count} records`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Database connection closed');
        }
    }
}

checkUsersTable(); 