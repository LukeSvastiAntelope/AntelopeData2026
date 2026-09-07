import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { openSql } from '@/app/utils/database/db';

export type AutomationType = 'news_scraper' | 'company_scraper' | 'bbc_commodity_bot';

export interface AutomationConfig {
  // news_scraper
  state?: string;
  district?: string;
  // company_scraper
  region?: string;
  min_employees?: number;
  // bbc_commodity_bot
  keywords?: string;
}

export interface AutomationRow {
  id: number;
  user_id: number;
  type: AutomationType;
  name: string;
  config: AutomationConfig;
  enabled: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const db = await openSql();
    const [rows] = await db.execute<any[]>(
      'SELECT id, user_id, type, name, config, enabled, last_run_at, created_at, updated_at FROM dashboard_automations WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    const automations = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      name: r.name,
      config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config || {},
      enabled: !!r.enabled,
      last_run_at: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    }));
    return NextResponse.json({ status: true, automations });
  } catch (error) {
    console.error('Automations GET error:', error);
    return NextResponse.json({ error: 'Failed to list automations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = await request.json();
    const { type, name, config } = body as { type: AutomationType; name: string; config: AutomationConfig };
    if (!type || !name || !config) {
      return NextResponse.json({ error: 'Missing type, name, or config' }, { status: 400 });
    }
    const allowed: AutomationType[] = ['news_scraper', 'company_scraper', 'bbc_commodity_bot'];
    if (!allowed.includes(type)) {
      return NextResponse.json({ error: 'Invalid automation type' }, { status: 400 });
    }
    const db = await openSql();
    const [result] = await db.execute<any>(
      'INSERT INTO dashboard_automations (user_id, type, name, config) VALUES (?, ?, ?, ?)',
      [userId, type, name, JSON.stringify(config)]
    );
    const id = (result as any)?.insertId;
    if (!id) {
      return NextResponse.json({ error: 'Failed to create automation' }, { status: 500 });
    }
    return NextResponse.json({ status: true, id, message: 'Automation created. Runs can be scheduled or triggered from the dashboard.' });
  } catch (error) {
    console.error('Automations POST error:', error);
    return NextResponse.json({ error: 'Failed to create automation' }, { status: 500 });
  }
}
