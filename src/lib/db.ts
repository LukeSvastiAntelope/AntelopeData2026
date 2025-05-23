import { Pool } from 'pg'

// Create a new pool instance
export const db = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE,
})

// Export query helper
export const query = async (text: string, params?: any[]) => {
  const start = Date.now()
  const res = await db.query(text, params)
  const duration = Date.now() - start
  console.log('executed query', { text, duration, rows: res.rowCount })
  return res
} 