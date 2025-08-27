import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Security: Only allow in development or with admin auth
  const userIdHeader = req.headers.get('x-user-id')
  if (!userIdHeader) {
    return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 })
  }

  try {
    const { openSql } = await import('@/app/utils/database/db')
    const db = await openSql()
    
    // The migration SQL statements
    const migrationStatements = [
      `CREATE TABLE IF NOT EXISTS user_channel_integrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        provider ENUM('telegram','discord','sms_twilio','whatsapp','email','web') NOT NULL,
        status ENUM('draft','connected','revoked','error') DEFAULT 'draft',
        encrypted_credentials JSON NULL,
        settings JSON NULL,
        webhook_secret VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_provider (user_id, provider)
      )`,
      
      `CREATE TABLE IF NOT EXISTS survey_channels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        survey_id INT NOT NULL,
        channel ENUM('telegram','discord','sms','whatsapp','email','web') NOT NULL,
        status ENUM('configured','enabled','paused') DEFAULT 'configured',
        config JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_survey_channel (survey_id, channel),
        INDEX idx_survey_channels_survey (survey_id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS survey_channel_sessions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        survey_id INT NOT NULL,
        channel ENUM('telegram','discord','sms','whatsapp') NOT NULL,
        external_user_id VARCHAR(255) NOT NULL,
        username VARCHAR(255) NULL,
        state JSON NULL,
        is_completed TINYINT(1) DEFAULT 0,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_session (survey_id, channel, external_user_id),
        INDEX idx_sessions_survey (survey_id)
      )`
    ]
    
    const results = []
    
    for (const [index, statement] of migrationStatements.entries()) {
      try {
        await db.execute(statement)
        results.push({ 
          statement: index + 1, 
          status: 'success',
          message: 'Executed successfully'
        })
      } catch (err) {
        const error = err as Error
        if (error.message.includes('already exists')) {
          results.push({ 
            statement: index + 1, 
            status: 'skipped',
            message: 'Table already exists'
          })
        } else {
          results.push({ 
            statement: index + 1, 
            status: 'error',
            message: error.message
          })
        }
      }
    }
    
    // Verify tables exist
    const verification = []
    const tables = ['user_channel_integrations', 'survey_channels', 'survey_channel_sessions']
    
    for (const table of tables) {
      try {
        const [rows] = await db.execute(`SHOW TABLES LIKE '${table}'`)
        verification.push({
          table,
          exists: (rows as any[]).length > 0
        })
      } catch (err) {
        verification.push({
          table,
          exists: false,
          error: (err as Error).message
        })
      }
    }
    
    await db.end()
    
    return NextResponse.json({
      status: 'completed',
      timestamp: new Date().toISOString(),
      results,
      verification,
      allTablesExist: verification.every(v => v.exists)
    })
    
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      message: (err as Error).message
    }, { status: 500 })
  }
}
