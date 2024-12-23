import mysql from 'mysql2/promise';

const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    maxIdle: 10,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
}

// Create a single pool instance
let pool: mysql.Pool | null = null;

export const openSql = async () => {
    if (!pool) {
        pool = mysql.createPool(connectionParams);
    }
    return pool;
}

// Add a method to explicitly close the pool if needed
export const closePool = async () => {
    if (pool) {
        await pool.end();
        pool = null;
    }
}