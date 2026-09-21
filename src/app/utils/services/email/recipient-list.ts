/**
 * P2 — Recipient list helpers for in-Antelope email send.
 * Parse paste / spreadsheet rows, validate, dedupe, drop suppression matches.
 * Server-safe (no browser APIs).
 */

import { openSql } from '@/app/utils/database/db';
import type { RowDataPacket } from 'mysql2';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/** Soft cap per send request (50 or 5,000 — same flow). */
export const EMAIL_SEND_MAX_RECIPIENTS = 5000;

export type PreparedEmailList = {
  emails: string[];
  rawCount: number;
  invalidCount: number;
  duplicateCount: number;
  suppressedCount: number;
  suppressed: string[];
};

/** Normalize a pasted blob (one-per-line or comma/semicolon separated). */
export function parseEmailPaste(raw: string): string[] {
  return String(raw || '')
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Extract emails from spreadsheet rows (header row optional).
 * Prefers a column whose header matches /e-?mail/i; otherwise scans all cells.
 */
export function extractEmailsFromRows(rows: unknown[][]): string[] {
  if (!rows.length) return [];
  const out = new Set<string>();

  const header = (rows[0] || []).map((c) => String(c ?? '').toLowerCase().trim());
  const emailCol = header.findIndex((h) => /e-?mail/.test(h));

  if (emailCol >= 0) {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const val = row[emailCol];
      if (val == null) continue;
      const s = String(val).trim();
      if (EMAIL_RE.test(s)) out.add(s.toLowerCase());
    }
    if (out.size) return Array.from(out);
  }

  for (const row of rows) {
    for (const cell of (row as unknown[]) || []) {
      if (cell == null) continue;
      const s = String(cell).trim();
      if (EMAIL_RE.test(s)) out.add(s.toLowerCase());
    }
  }
  return Array.from(out);
}

/** Validate + dedupe without suppression. */
export function validateAndDedupeEmails(raw: string[]): {
  emails: string[];
  rawCount: number;
  invalidCount: number;
  duplicateCount: number;
} {
  const rawCount = raw.length;
  const seen = new Set<string>();
  let invalidCount = 0;
  let duplicateCount = 0;
  const emails: string[] = [];

  for (const item of raw) {
    const e = String(item || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(e)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(e);
    emails.push(e);
  }

  return { emails, rawCount, invalidCount, duplicateCount };
}

/**
 * Emails on the org suppression list via person_records linked to contact_suppression.
 */
export async function loadSuppressedEmails(
  organizationId: number
): Promise<Set<string>> {
  const db = await openSql();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DISTINCT LOWER(TRIM(pr.email)) AS email
     FROM contact_suppression cs
     INNER JOIN person_records pr
       ON pr.id = cs.person_record_id
      AND pr.organization_id = cs.organization_id
     WHERE cs.organization_id = ?
       AND pr.email IS NOT NULL
       AND TRIM(pr.email) <> ''`,
    [organizationId]
  );
  const set = new Set<string>();
  for (const r of rows) {
    const e = r.email != null ? String(r.email).trim().toLowerCase() : '';
    if (e && EMAIL_RE.test(e)) set.add(e);
  }
  return set;
}

/**
 * Full prepare: validate → dedupe → drop suppressed.
 */
export async function prepareRecipientList(opts: {
  organizationId: number;
  raw: string[];
  skipSuppression?: boolean;
}): Promise<PreparedEmailList> {
  const base = validateAndDedupeEmails(opts.raw);
  if (opts.skipSuppression) {
    return {
      ...base,
      suppressedCount: 0,
      suppressed: [],
    };
  }

  const suppressedSet = await loadSuppressedEmails(opts.organizationId);
  const suppressed: string[] = [];
  const emails: string[] = [];
  for (const e of base.emails) {
    if (suppressedSet.has(e)) suppressed.push(e);
    else emails.push(e);
  }

  return {
    emails,
    rawCount: base.rawCount,
    invalidCount: base.invalidCount,
    duplicateCount: base.duplicateCount,
    suppressedCount: suppressed.length,
    suppressed: suppressed.slice(0, 50),
  };
}
