import { openSql as getMySQLConnection } from './db'
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getEncryptionKey(): Buffer {
  const key = process.env.SECURE_STORAGE_KEY || ''
  if (!key || key.length < 32) {
    throw new Error('SECURE_STORAGE_KEY must be set to a 32+ char value')
  }
  return Buffer.from(key.substring(0, 32))
}

function encryptJson(obj: any): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', getEncryptionKey(), iv)
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decryptJson(enc: string | null): any | null {
  if (!enc) return null
  const [ivHex, dataHex] = enc.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', getEncryptionKey(), iv)
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
  try {
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    return null
  }
}

export const ChannelRepo = {
  upsertUserTelegramIntegration: async (userId: number, botToken: string, settings: Record<string, any>, webhookSecret?: string) => {
    const db = await getMySQLConnection()
    // encrypted_credentials is a MySQL `json` column — it must be a valid JSON
    // document, so the "iv:ciphertext" string from encryptJson() has to be
    // JSON-encoded (quoted) before it's stored. mysql2 auto-decodes JSON
    // columns back to the plain string on read, so decryptJson() needs no
    // corresponding change.
    const encrypted = JSON.stringify(encryptJson({ botToken }))
    const settingsJson = JSON.stringify({ ...(settings||{}), webhookSecret: webhookSecret || null })
    await db.execute(
      `INSERT INTO user_channel_integrations (user_id, provider, status, encrypted_credentials, settings)
       VALUES (?, 'telegram', 'connected', ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), encrypted_credentials = VALUES(encrypted_credentials), settings = VALUES(settings), updated_at = CURRENT_TIMESTAMP`,
      [userId, encrypted, settingsJson]
    )
    return true
  },

  getUserTelegramIntegration: async (userId: number) => {
    const db = await getMySQLConnection()
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM user_channel_integrations WHERE user_id = ? AND provider = 'telegram' LIMIT 1`,
      [userId]
    )
    if (!rows[0]) return null
    const row = rows[0]
    const creds = decryptJson((row as any).encrypted_credentials)
    // mysql2 auto-decodes `json` columns to native objects, but tolerate a
    // raw string too in case a row was ever written outside this helper.
    const rawSettings = (row as any).settings
    const settings = rawSettings && typeof rawSettings === 'object'
      ? rawSettings
      : (() => { try { return JSON.parse(rawSettings || '{}') } catch { return null } })()
    return { ...row, credentials: creds, settings }
  },

  enableSurveyChannel: async (surveyId: number, channel: 'telegram'|'discord'|'sms'|'whatsapp'|'email'|'web', config?: any) => {
    const db = await getMySQLConnection()
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO survey_channels (survey_id, channel, status, config)
       VALUES (?, ?, 'enabled', ?)
       ON DUPLICATE KEY UPDATE status='enabled', config = VALUES(config), updated_at=CURRENT_TIMESTAMP`,
      [surveyId, channel, config ? JSON.stringify(config) : null]
    )
    return (result as ResultSetHeader).affectedRows > 0
  },

  setSurveyChannelStatus: async (
    surveyId: number,
    channel: 'telegram'|'discord'|'sms'|'whatsapp'|'email'|'web',
    status: 'configured'|'enabled'|'paused'
  ) => {
    const db = await getMySQLConnection()
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO survey_channels (survey_id, channel, status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at=CURRENT_TIMESTAMP`,
      [surveyId, channel, status]
    )
    return (result as ResultSetHeader).affectedRows > 0
  },

  getSurveyChannelConfig: async (surveyId: number, channel: string) => {
    const db = await getMySQLConnection()
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_channels WHERE survey_id = ? AND channel = ? LIMIT 1`,
      [surveyId, channel]
    )
    if (!rows[0]) return null
    const row = rows[0]
    let config: any = null
    try { config = JSON.parse((row as any).config || '{}') } catch {}
    return { ...row, config }
  },

  // Session helpers
  getOrCreateTelegramSession: async (surveyId: number, chatId: string, username?: string) => {
    const db = await getMySQLConnection()
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_channel_sessions WHERE survey_id = ? AND channel = 'telegram' AND external_user_id = ? LIMIT 1`,
      [surveyId, chatId]
    )
    if (rows[0]) {
      const existing: any = rows[0]
      if (existing.is_completed) {
        // Re-open prior session slot (unique key prevents a second row). Reset state and flags.
        await db.execute(
          `UPDATE survey_channel_sessions 
             SET is_completed = 0, completed_at = NULL, username = COALESCE(?, username), state = JSON_OBJECT('currentQuestionIndex', 0), updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [username || null, existing.id]
        )
        const [refetched] = await db.execute<RowDataPacket[]>(
          `SELECT * FROM survey_channel_sessions WHERE id = ?`,
          [existing.id]
        )
        return refetched[0]
      }
      // Ensure username is up to date if provided
      if (username && username !== existing.username) {
        await db.execute(`UPDATE survey_channel_sessions SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [username, existing.id])
        const [refetched] = await db.execute<RowDataPacket[]>(`SELECT * FROM survey_channel_sessions WHERE id = ?`, [existing.id])
        return refetched[0]
      }
      return existing
    }
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO survey_channel_sessions (survey_id, channel, external_user_id, username, state)
       VALUES (?, 'telegram', ?, ?, JSON_OBJECT('currentQuestionIndex', 0))`,
      [surveyId, chatId, username || null]
    )
    const insertedId = (result as ResultSetHeader).insertId
    const [created] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_channel_sessions WHERE id = ?`,
      [insertedId]
    )
    return created[0]
  },

  getActiveTelegramSessionByChat: async (chatId: string) => {
    const db = await getMySQLConnection()
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM survey_channel_sessions 
       WHERE channel = 'telegram' AND external_user_id = ? AND is_completed = 0 
       ORDER BY updated_at DESC LIMIT 1`,
      [chatId]
    )
    return rows[0] || null
  },

  updateSessionState: async (sessionId: number, state: any) => {
    const db = await getMySQLConnection()
    await db.execute(
      `UPDATE survey_channel_sessions SET state = ? WHERE id = ?`,
      [JSON.stringify(state), sessionId]
    )
    return true
  },

  completeSession: async (sessionId: number) => {
    const db = await getMySQLConnection()
    await db.execute(
      `UPDATE survey_channel_sessions SET is_completed = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sessionId]
    )
    return true
  }
}


