import mysql from 'mysql2/promise';

const connectionParams = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
}

export const openSql = async () => {
    const connection = await mysql.createConnection(connectionParams);
    return connection;
}