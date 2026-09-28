/**
 * Admin A3 — content_sheets repository (pricing / feature comparison JSON).
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';

export type PricingPlan = {
  name: string;
  description: string;
  monthly: number;
  annual: number;
  save: number;
};

export type PricingFeatureRow = {
  label: string;
  values: string[];
};

export type PricingSheetContent = {
  headline: string;
  subheadline: string;
  trial: { title: string; body: string };
  free: { title: string; body: string };
  plans: PricingPlan[];
  featureRows: PricingFeatureRow[];
  everyPlan: { title: string; body: string };
  footnote: string;
};

export type ContentSheetRecord = {
  sheetKey: string;
  title: string;
  content: unknown;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function parseJson(raw: unknown): unknown {
  try {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function mapRow(row: RowDataPacket): ContentSheetRecord {
  return {
    sheetKey: String(row.sheet_key),
    title: String(row.title || ''),
    content: parseJson(row.content_json),
    updatedBy: row.updated_by != null ? Number(row.updated_by) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export const ContentSheetRepo = {
  async get(sheetKey: string): Promise<ContentSheetRecord | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM content_sheets WHERE sheet_key = ? LIMIT 1`,
      [String(sheetKey)]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async list(): Promise<ContentSheetRecord[]> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM content_sheets ORDER BY sheet_key ASC`
    );
    return rows.map(mapRow);
  },

  async upsert(input: {
    sheetKey: string;
    title: string;
    content: unknown;
    updatedBy?: number | null;
  }): Promise<ContentSheetRecord> {
    const key = String(input.sheetKey || '')
      .trim()
      .toLowerCase()
      .slice(0, 64);
    if (!key) throw new Error('sheetKey is required');

    const db = await openSql();
    await db.execute<ResultSetHeader>(
      `INSERT INTO content_sheets (sheet_key, title, content_json, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         content_json = VALUES(content_json),
         updated_by = VALUES(updated_by)`,
      [
        key,
        String(input.title || '').slice(0, 255),
        JSON.stringify(input.content ?? {}),
        input.updatedBy != null ? Number(input.updatedBy) : null,
      ]
    );
    const row = await this.get(key);
    if (!row) throw new Error('Failed to load content sheet');
    return row;
  },
};

/** Canonical default for the public pricing page (was hardcoded). */
export const DEFAULT_PRICING_SHEET: PricingSheetContent = {
  headline: 'Simple, transparent pricing',
  subheadline:
    'The same published price for everyone. Start free — no card, no commitment.',
  trial: {
    title: 'Trial',
    body: 'The full product free for 2 weeks. Run surveys across SMS, WhatsApp, and Telegram with analytics built in. No card required.',
  },
  free: {
    title: 'Free',
    body: "Keep a live account for good. Create surveys and see your baseline analytics, and every past dataset and query stays yours — so you're ready whenever you need to run.",
  },
  plans: [
    {
      name: 'Hyperlocal',
      description:
        'Small PACs, experimental groups, classroom & civic projects',
      monthly: 49,
      annual: 490,
      save: 98,
    },
    {
      name: 'Local',
      description: 'Candidates and committees active in a local race',
      monthly: 99,
      annual: 990,
      save: 198,
    },
    {
      name: 'State',
      description: 'State orgs, multi-county operations, and larger PACs',
      monthly: 299,
      annual: 2990,
      save: 598,
    },
    {
      name: 'Federal',
      description: 'Congressional campaigns, state HQs, and federal orgs',
      monthly: 499,
      annual: 4990,
      save: 998,
    },
  ],
  featureRows: [
    {
      label: 'Publishable surveys/week',
      values: ['1', '2', '5', 'Unlimited'],
    },
    {
      label: 'Outreach/week (SMS, WhatsApp, Telegram)',
      values: ['50', '200', 'Higher', 'Highest'],
    },
    {
      label: 'Analytics',
      values: ['Full', 'Full + local', 'Regional', 'Federal'],
    },
    {
      label: 'District data overlay & co-pilot',
      values: ['—', 'Yes', 'Yes', 'Yes'],
    },
    {
      label: 'Compliance, payments & volunteer tools',
      values: ['—', 'Yes', 'Yes', 'Yes'],
    },
    {
      label: 'Priority support',
      values: ['—', '—', 'Yes', 'Yes'],
    },
  ],
  everyPlan: {
    title: 'Every plan',
    body: "Your data stays yours — full access to past datasets, queries, and survey work, always. Cancel anytime with 7 days' notice. Full customer support included.",
  },
  footnote:
    'Annual is two months free — pay for ten, get twelve. Enterprise and non-profit pricing available on request.',
};

export function coercePricingSheet(raw: unknown): PricingSheetContent {
  const base = DEFAULT_PRICING_SHEET;
  if (!raw || typeof raw !== 'object') return { ...base, plans: [...base.plans], featureRows: base.featureRows.map((r) => ({ ...r, values: [...r.values] })) };
  const o = raw as Record<string, unknown>;
  const plans = Array.isArray(o.plans)
    ? o.plans.map((p) => {
        const plan = (p || {}) as Record<string, unknown>;
        return {
          name: String(plan.name || ''),
          description: String(plan.description || ''),
          monthly: Number(plan.monthly) || 0,
          annual: Number(plan.annual) || 0,
          save: Number(plan.save) || 0,
        };
      })
    : base.plans.map((p) => ({ ...p }));
  const featureRows = Array.isArray(o.featureRows)
    ? o.featureRows.map((r) => {
        const row = (r || {}) as Record<string, unknown>;
        return {
          label: String(row.label || ''),
          values: Array.isArray(row.values)
            ? row.values.map(String)
            : [],
        };
      })
    : base.featureRows.map((r) => ({ ...r, values: [...r.values] }));
  const trial = (o.trial || {}) as Record<string, unknown>;
  const free = (o.free || {}) as Record<string, unknown>;
  const everyPlan = (o.everyPlan || {}) as Record<string, unknown>;
  return {
    headline: String(o.headline || base.headline),
    subheadline: String(o.subheadline || base.subheadline),
    trial: {
      title: String(trial.title || base.trial.title),
      body: String(trial.body || base.trial.body),
    },
    free: {
      title: String(free.title || base.free.title),
      body: String(free.body || base.free.body),
    },
    plans,
    featureRows,
    everyPlan: {
      title: String(everyPlan.title || base.everyPlan.title),
      body: String(everyPlan.body || base.everyPlan.body),
    },
    footnote: String(o.footnote || base.footnote),
  };
}
