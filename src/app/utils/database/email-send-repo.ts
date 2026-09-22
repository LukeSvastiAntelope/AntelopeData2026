/**
 * P3 — Email send persistence, per-candidate suppression, delivery events.
 * Tables created on first use (same pattern as voter_segments / optins).
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { openSql } from '@/app/utils/database/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export type EmailSuppressionReason =
  | 'unsubscribe'
  | 'bounce'
  | 'complaint'
  | 'manual';

export type EmailRecipientStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'bounced'
  | 'complained'
  | 'failed';

let tablesReady: Promise<void> | null = null;

export async function ensureEmailTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      const db = await openSql();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS email_suppressions (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          organization_id INT NOT NULL DEFAULT 0,
          email VARCHAR(320) NOT NULL,
          reason VARCHAR(32) NOT NULL DEFAULT 'unsubscribe',
          source VARCHAR(64) NOT NULL DEFAULT 'manual',
          notes VARCHAR(512) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_email_suppress_user_email (user_id, email),
          KEY idx_email_suppress_org (organization_id),
          KEY idx_email_suppress_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS email_sends (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          organization_id INT NOT NULL DEFAULT 0,
          subject VARCHAR(500) NOT NULL,
          from_address VARCHAR(320) NOT NULL,
          provider VARCHAR(32) NOT NULL DEFAULT 'resend',
          receipt_id VARCHAR(96) NULL,
          summary_json JSON NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_email_sends_user (user_id, created_at),
          KEY idx_email_sends_org (organization_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS email_send_recipients (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          send_id BIGINT UNSIGNED NOT NULL,
          user_id INT NOT NULL,
          organization_id INT NOT NULL DEFAULT 0,
          email VARCHAR(320) NOT NULL,
          provider_message_id VARCHAR(128) NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'queued',
          unsub_token_hash CHAR(64) NULL,
          last_event_at TIMESTAMP NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_email_rcpt_send_email (send_id, email),
          KEY idx_email_rcpt_send (send_id),
          KEY idx_email_rcpt_user (user_id, created_at),
          KEY idx_email_rcpt_provider (provider_message_id),
          KEY idx_email_rcpt_email (user_id, email),
          CONSTRAINT fk_email_rcpt_send
            FOREIGN KEY (send_id) REFERENCES email_sends (id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS email_events (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          organization_id INT NOT NULL DEFAULT 0,
          send_id BIGINT UNSIGNED NULL,
          recipient_id BIGINT UNSIGNED NULL,
          email VARCHAR(320) NULL,
          event_type VARCHAR(64) NOT NULL,
          provider_message_id VARCHAR(128) NULL,
          payload_json JSON NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_email_events_user (user_id, created_at),
          KEY idx_email_events_org (organization_id, created_at),
          KEY idx_email_events_type (event_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })();
  }
  await tablesReady;
}

function unsubSecret(): string {
  return (
    process.env.EMAIL_UNSUB_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.JWT_SECRET_KEY?.trim() ||
    'antelope-email-unsub-dev'
  );
}

/** Stable opaque token for one-click unsubscribe (user + email scoped). */
export function mintUnsubscribeToken(params: {
  userId: number;
  email: string;
  sendId?: number | null;
}): string {
  const email = params.email.trim().toLowerCase();
  const payload = `${params.userId}:${email}:${params.sendId || 0}`;
  const sig = createHmac('sha256', unsubSecret()).update(payload).digest('base64url');
  const body = Buffer.from(payload).toString('base64url');
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): {
  userId: number;
  email: string;
  sendId: number;
} | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const payload = Buffer.from(body, 'base64url').toString('utf8');
    const expected = createHmac('sha256', unsubSecret()).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const [userIdRaw, email, sendIdRaw] = payload.split(':');
    const userId = Number(userIdRaw);
    const sendId = Number(sendIdRaw || 0);
    if (!Number.isFinite(userId) || userId <= 0 || !email) return null;
    return { userId, email: email.toLowerCase(), sendId };
  } catch {
    return null;
  }
}

export function hashUnsubscribeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const EmailSuppressionRepo = {
  async listForUser(userId: number, limit = 500): Promise<
    Array<{
      id: number;
      email: string;
      reason: string;
      source: string;
      createdAt: string;
    }>
  > {
    await ensureEmailTables();
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, email, reason, source, created_at
       FROM email_suppressions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${Math.min(Math.max(limit, 1), 5000)}`,
      [userId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      email: String(r.email),
      reason: String(r.reason),
      source: String(r.source),
      createdAt: r.created_at
        ? new Date(r.created_at).toISOString()
        : new Date().toISOString(),
    }));
  },

  async loadSet(userId: number): Promise<Set<string>> {
    await ensureEmailTables();
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT email FROM email_suppressions WHERE user_id = ?`,
      [userId]
    );
    return new Set(rows.map((r) => String(r.email).toLowerCase()));
  },

  async add(params: {
    userId: number;
    organizationId?: number | null;
    email: string;
    reason: EmailSuppressionReason;
    source?: string;
    notes?: string | null;
  }): Promise<{ id: number; inserted: boolean }> {
    await ensureEmailTables();
    const email = params.email.trim().toLowerCase();
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO email_suppressions
         (user_id, organization_id, email, reason, source, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         reason = VALUES(reason),
         source = VALUES(source),
         notes = COALESCE(VALUES(notes), notes)`,
      [
        params.userId,
        params.organizationId ?? 0,
        email,
        params.reason,
        params.source || params.reason,
        params.notes ?? null,
      ]
    );
    return {
      id: Number(result.insertId || 0),
      inserted: result.affectedRows === 1,
    };
  },
};

export const EmailSendRepo = {
  async createSend(params: {
    userId: number;
    organizationId: number;
    subject: string;
    fromAddress: string;
    provider: string;
    receiptId: string;
    summary: Record<string, unknown>;
  }): Promise<number> {
    await ensureEmailTables();
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO email_sends
         (user_id, organization_id, subject, from_address, provider, receipt_id, summary_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId,
        params.organizationId,
        params.subject.slice(0, 500),
        params.fromAddress.slice(0, 320),
        params.provider,
        params.receiptId,
        JSON.stringify(params.summary),
      ]
    );
    return Number(result.insertId);
  },

  async addRecipient(params: {
    sendId: number;
    userId: number;
    organizationId: number;
    email: string;
    providerMessageId?: string | null;
    status: EmailRecipientStatus;
    unsubTokenHash?: string | null;
  }): Promise<number> {
    await ensureEmailTables();
    const db = await openSql();
    // Idempotent on UNIQUE (send_id, email). LAST_INSERT_ID(id) returns the
    // existing row id on update so callers always get a usable recipient id.
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO email_send_recipients
         (send_id, user_id, organization_id, email, provider_message_id, status, unsub_token_hash, last_event_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         provider_message_id = COALESCE(VALUES(provider_message_id), provider_message_id),
         status = VALUES(status),
         unsub_token_hash = VALUES(unsub_token_hash),
         last_event_at = CURRENT_TIMESTAMP`,
      [
        params.sendId,
        params.userId,
        params.organizationId,
        params.email.toLowerCase(),
        params.providerMessageId ?? null,
        params.status,
        params.unsubTokenHash ?? null,
      ]
    );
    return Number(result.insertId);
  },

  /**
   * Emails already accepted by the provider for this send (skip on resume).
   */
  async loadSentEmails(sendId: number): Promise<Set<string>> {
    await ensureEmailTables();
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT email FROM email_send_recipients
       WHERE send_id = ?
         AND status IN ('sent', 'queued')`,
      [sendId]
    );
    return new Set(rows.map((r) => String(r.email).toLowerCase()));
  },

  /**
   * Load a send only when it belongs to this user + org (resume guard).
   */
  async getOwnedSend(
    sendId: number,
    userId: number,
    organizationId: number
  ): Promise<{
    id: number;
    userId: number;
    organizationId: number;
    subject: string;
    fromAddress: string;
    provider: string;
    receiptId: string | null;
    summary: Record<string, unknown>;
    createdAt: string;
  } | null> {
    await ensureEmailTables();
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, user_id, organization_id, subject, from_address, provider,
              receipt_id, summary_json, created_at
       FROM email_sends
       WHERE id = ? AND user_id = ? AND organization_id = ?
       LIMIT 1`,
      [sendId, userId, organizationId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      organizationId: Number(row.organization_id),
      subject: String(row.subject),
      fromAddress: String(row.from_address),
      provider: String(row.provider),
      receiptId: row.receipt_id != null ? String(row.receipt_id) : null,
      summary:
        typeof row.summary_json === 'string'
          ? JSON.parse(row.summary_json)
          : (row.summary_json as Record<string, unknown>) || {},
      createdAt: row.created_at
        ? new Date(row.created_at).toISOString()
        : new Date().toISOString(),
    };
  },

  async updateRecipientByProviderId(params: {
    providerMessageId: string;
    status: EmailRecipientStatus;
  }): Promise<{
    recipientId: number;
    sendId: number;
    userId: number;
    organizationId: number;
    email: string;
  } | null> {
    await ensureEmailTables();
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, send_id, user_id, organization_id, email, status
       FROM email_send_recipients
       WHERE provider_message_id = ?
       LIMIT 1`,
      [params.providerMessageId]
    );
    const row = rows[0];
    if (!row) return null;

    // Don't downgrade opened → delivered, etc.
    const rank: Record<string, number> = {
      queued: 0,
      sent: 1,
      delivered: 2,
      opened: 3,
      bounced: 4,
      complained: 5,
      failed: 4,
    };
    const current = String(row.status);
    if ((rank[params.status] ?? 0) < (rank[current] ?? 0) && current !== 'sent') {
      // allow bounce/complaint to override opened
      if (params.status !== 'bounced' && params.status !== 'complained') {
        return {
          recipientId: Number(row.id),
          sendId: Number(row.send_id),
          userId: Number(row.user_id),
          organizationId: Number(row.organization_id),
          email: String(row.email),
        };
      }
    }

    await db.execute(
      `UPDATE email_send_recipients
       SET status = ?, last_event_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [params.status, row.id]
    );
    return {
      recipientId: Number(row.id),
      sendId: Number(row.send_id),
      userId: Number(row.user_id),
      organizationId: Number(row.organization_id),
      email: String(row.email),
    };
  },

  async listRecentSends(userId: number, limit = 20) {
    await ensureEmailTables();
    const db = await openSql();
    const [sends] = await db.execute<RowDataPacket[]>(
      `SELECT id, subject, from_address, provider, receipt_id, summary_json, created_at
       FROM email_sends
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${Math.min(Math.max(limit, 1), 50)}`,
      [userId]
    );
    const out = [];
    for (const s of sends) {
      const sendId = Number(s.id);
      const [rcpts] = await db.execute<RowDataPacket[]>(
        `SELECT id, email, provider_message_id, status, last_event_at, created_at
         FROM email_send_recipients
         WHERE send_id = ?
         ORDER BY id ASC
         LIMIT 500`,
        [sendId]
      );
      out.push({
        id: sendId,
        subject: String(s.subject),
        from: String(s.from_address),
        provider: String(s.provider),
        receiptId: s.receipt_id != null ? String(s.receipt_id) : null,
        summary:
          typeof s.summary_json === 'string'
            ? JSON.parse(s.summary_json)
            : s.summary_json || {},
        createdAt: s.created_at
          ? new Date(s.created_at).toISOString()
          : new Date().toISOString(),
        recipients: rcpts.map((r) => ({
          id: Number(r.id),
          email: String(r.email),
          providerMessageId: r.provider_message_id
            ? String(r.provider_message_id)
            : null,
          status: String(r.status),
          lastEventAt: r.last_event_at
            ? new Date(r.last_event_at).toISOString()
            : null,
        })),
      });
    }
    return out;
  },
};

export const EmailEventRepo = {
  async record(params: {
    userId: number;
    organizationId: number;
    sendId?: number | null;
    recipientId?: number | null;
    email?: string | null;
    eventType: string;
    providerMessageId?: string | null;
    payload?: Record<string, unknown> | null;
  }): Promise<number> {
    await ensureEmailTables();
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO email_events
         (user_id, organization_id, send_id, recipient_id, email, event_type,
          provider_message_id, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId,
        params.organizationId,
        params.sendId ?? null,
        params.recipientId ?? null,
        params.email ?? null,
        params.eventType,
        params.providerMessageId ?? null,
        params.payload ? JSON.stringify(params.payload) : null,
      ]
    );
    return Number(result.insertId);
  },

  async listForUser(userId: number, limit = 50) {
    await ensureEmailTables();
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, send_id, email, event_type, provider_message_id, created_at
       FROM email_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${Math.min(Math.max(limit, 1), 200)}`,
      [userId]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      sendId: r.send_id != null ? Number(r.send_id) : null,
      email: r.email != null ? String(r.email) : null,
      eventType: String(r.event_type),
      providerMessageId: r.provider_message_id
        ? String(r.provider_message_id)
        : null,
      createdAt: r.created_at
        ? new Date(r.created_at).toISOString()
        : new Date().toISOString(),
    }));
  },
};
