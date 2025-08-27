const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
require('dotenv').config()

async function main() {
  const [email, newPassword] = process.argv.slice(2)
  if (!email || !newPassword) {
    console.error('Usage: node scripts/set-password.js <email> <newPassword>')
    process.exit(1)
  }

  const host = process.env.MYSQL_HOST || process.env.DB_HOST
  const user = process.env.MYSQL_USER || process.env.DB_USER
  const pass = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'marketmaker'
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306)

  let conn
  try {
    conn = await mysql.createConnection({ host, user, password: pass, database, port, ssl: { rejectUnauthorized: false } })
    const [rows] = await conn.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
    if (!rows[0]) {
      console.error('User not found for email:', email)
      process.exit(2)
    }
    const id = rows[0].id
    const hashed = bcrypt.hashSync(newPassword, 10)
    await conn.execute('UPDATE users SET password = ?, is_verified = 1 WHERE id = ?', [hashed, id])
    console.log(JSON.stringify({ ok: true, id }))
  } catch (e) {
    console.error('error:', e.message)
    process.exit(3)
  } finally {
    if (conn) await conn.end()
  }
}

main()






