import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // This endpoint helps diagnose deployment issues by showing what commit/build is running.
  // Guard it in production to avoid leaking operational details.

  const token =
    new URL(req.url).searchParams.get('token') ||
    req.headers.get('x-admin-token') ||
    ''
  const requireToken = process.env.NODE_ENV === 'production'
  if (requireToken) {
    if (!process.env.ADMIN_TASK_TOKEN || token !== process.env.ADMIN_TASK_TOKEN) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
  }
  
  const info: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
  }

  // Try to get git commit info
  try {
    const gitDir = process.cwd()
    const gitCommit = execSync('git rev-parse HEAD', { 
      cwd: gitDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { 
      cwd: gitDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    
    const gitCommitShort = execSync('git rev-parse --short HEAD', { 
      cwd: gitDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    
    const gitCommitMessage = execSync('git log -1 --pretty=format:"%s"', { 
      cwd: gitDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    
    const gitCommitDate = execSync('git log -1 --pretty=format:"%ci"', { 
      cwd: gitDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()

    info.git = {
      commit: gitCommit,
      commitShort: gitCommitShort,
      branch: gitBranch,
      message: gitCommitMessage,
      date: gitCommitDate,
      isDirty: execSync('git status --porcelain', { 
        cwd: gitDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim().length > 0
    }
  } catch (err) {
    info.git = {
      error: (err as Error).message
    }
  }

  // Try to get Next.js build info
  try {
    const buildIdPath = join(process.cwd(), '.next', 'BUILD_ID')
    const buildId = readFileSync(buildIdPath, 'utf-8').trim()
    info.build = {
      id: buildId,
      exists: true
    }
  } catch (err) {
    info.build = {
      exists: false,
      error: (err as Error).message
    }
  }

  // Check critical env vars (without exposing values)
  info.env = {
    OPENAI_API_KEY: {
      isSet: Boolean(process.env.OPENAI_API_KEY),
      length: process.env.OPENAI_API_KEY?.length || 0
    },
    MYSQL_HOST: {
      isSet: Boolean(process.env.MYSQL_HOST),
      value: process.env.MYSQL_HOST || 'NOT_SET'
    },
    AUTH_SECRET: {
      isSet: Boolean(process.env.AUTH_SECRET),
      length: process.env.AUTH_SECRET?.length || 0
    },
    NODE_ENV: process.env.NODE_ENV || 'NOT_SET'
  }

  return NextResponse.json({
    status: 'ok',
    ...info
  }, { 
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
}

