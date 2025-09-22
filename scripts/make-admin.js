const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];
  if (!email || !newPassword) {
    console.error('Usage: node scripts/make-admin.js <email> <password>');
    process.exit(1);
  }

  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
  });

  try {
    const [rows] = await pool.execute('SELECT id, email, role FROM users WHERE email = ?', [email]);
    if (!rows[0]) {
      console.error('User not found for email:', email);
      process.exit(2);
    }

    const hashed = bcrypt.hashSync(newPassword, 10);
    await pool.execute('UPDATE users SET role = ?, password = ? WHERE email = ?', ['admin', hashed, email]);

    const [verify] = await pool.execute('SELECT id, email, role FROM users WHERE email = ?', [email]);
    console.log('Updated user:', verify[0]);
    console.log('Done.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});




