const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
require('dotenv').config()

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Usage: node scripts/check-login.js <email> <password>')
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
    const [rows] = await conn.execute('SELECT id, email, password, is_verified FROM users WHERE email = ? LIMIT 1', [email])
    if (!rows[0]) {
      console.log(JSON.stringify({ ok: false, reason: 'email_not_found' }))
      return
    }
    const row = rows[0]
    const match = bcrypt.compareSync(password, row.password)
    const isVerified = row.is_verified === 1
    console.log(JSON.stringify({ ok: match && isVerified, match, isVerified, id: row.id }))
  } catch (e) {
    console.error('error:', e.message)
    process.exit(2)
  } finally {
    if (conn) await conn.end()
  }
}

main()






