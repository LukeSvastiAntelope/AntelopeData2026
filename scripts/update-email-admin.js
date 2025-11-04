const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
  const oldEmail = process.argv[2];
  const newEmail = process.argv[3];
  const newPassword = process.argv[4];
  if (!oldEmail || !newEmail || !newPassword) {
    console.error('Usage: node scripts/update-email-admin.js <oldEmail> <newEmail> <password>');
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
    const [rows] = await pool.execute('SELECT id, email, role FROM users WHERE email = ?', [oldEmail]);
    if (!rows[0]) {
      console.error('User not found for oldEmail:', oldEmail);
      process.exit(2);
    }

    const hashed = bcrypt.hashSync(newPassword, 10);

    // Update email, role, and password
    await pool.execute('UPDATE users SET email = ?, role = ?, password = ? WHERE email = ?', [newEmail, 'admin', hashed, oldEmail]);

    const [verify] = await pool.execute('SELECT id, email, role FROM users WHERE email = ?', [newEmail]);
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






















