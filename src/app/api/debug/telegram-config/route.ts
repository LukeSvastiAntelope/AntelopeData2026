import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // This endpoint helps diagnose Telegram integration issues
  
  const config = {
    PUBLIC_BASE_URL: {
      value: process.env.PUBLIC_BASE_URL || 'NOT_SET',
      isSet: Boolean(process.env.PUBLIC_BASE_URL),
      length: process.env.PUBLIC_BASE_URL?.length || 0
    },
    NEXT_PUBLIC_APP_URL: {
      value: process.env.NEXT_PUBLIC_APP_URL || 'NOT_SET',
      isSet: Boolean(process.env.NEXT_PUBLIC_APP_URL),
      length: process.env.NEXT_PUBLIC_APP_URL?.length || 0
    },
    SECURE_STORAGE_KEY: {
      value: process.env.SECURE_STORAGE_KEY ? '***SET***' : 'NOT_SET',
      isSet: Boolean(process.env.SECURE_STORAGE_KEY),
      length: process.env.SECURE_STORAGE_KEY?.length || 0,
      isValidLength: (process.env.SECURE_STORAGE_KEY?.length || 0) >= 32
    },
    TELEGRAM_WEBHOOK_SECRET: {
      value: process.env.TELEGRAM_WEBHOOK_SECRET ? '***SET***' : 'NOT_SET',
      isSet: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      length: process.env.TELEGRAM_WEBHOOK_SECRET?.length || 0
    },
    TELEGRAM_DEBUG: {
      value: process.env.TELEGRAM_DEBUG || 'NOT_SET',
      isSet: Boolean(process.env.TELEGRAM_DEBUG)
    }
  }

  // Check database connection
  let dbStatus = 'UNKNOWN'
  let dbTables = []
  try {
    const { openSql } = await import('@/app/utils/database/db')
    const db = await openSql()
    
    // Test connection
    await db.execute('SELECT 1')
    dbStatus = 'CONNECTED'
    
    // Check if tables exist
    const tables = ['user_channel_integrations', 'survey_channels', 'survey_channel_sessions']
    for (const table of tables) {
      try {
        const [rows] = await db.execute(`SHOW TABLES LIKE '${table}'`)
        dbTables.push({
          name: table,
          exists: (rows as any[]).length > 0
        })
      } catch (err) {
        dbTables.push({
          name: table,
          exists: false,
          error: (err as Error).message
        })
      }
    }
    
    await db.end()
  } catch (err) {
    dbStatus = `ERROR: ${(err as Error).message}`
  }

  const summary = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    allRequiredSet: config.PUBLIC_BASE_URL.isSet && 
                   config.SECURE_STORAGE_KEY.isSet && 
                   config.TELEGRAM_WEBHOOK_SECRET.isSet,
    databaseStatus: dbStatus,
    readyForTelegram: config.PUBLIC_BASE_URL.isSet && 
                     config.SECURE_STORAGE_KEY.isSet && 
                     config.TELEGRAM_WEBHOOK_SECRET.isSet &&
                     dbStatus === 'CONNECTED' &&
                     dbTables.every(t => t.exists)
  }

  return NextResponse.json({
    status: 'ok',
    config,
    database: {
      status: dbStatus,
      tables: dbTables
    },
    summary
  }, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
}
