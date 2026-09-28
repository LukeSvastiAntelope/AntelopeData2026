/**
 * Admin A3 — blog_posts repository.
 */

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { openSql } from '@/app/utils/database/db';
import type { BlogPost } from '@/types/blog';

export type BlogPostStatus = 'draft' | 'published';

export type BlogPostRecord = BlogPost & {
  status: BlogPostStatus;
  publishedAt: string | null;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: number | null;
  updatedBy: number | null;
};

export type BlogPostWriteInput = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  readTime: string;
  tags: string[];
  author: { name: string; avatar?: string };
  status?: BlogPostStatus;
  sortOrder?: number;
  publishedAt?: string | null;
};

function parseTags(raw: unknown): string[] {
  try {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function mapRow(row: RowDataPacket): BlogPostRecord {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    excerpt: String(row.excerpt || ''),
    content: String(row.content || ''),
    date: String(row.date_display || ''),
    readTime: String(row.read_time || ''),
    tags: parseTags(row.tags_json),
    author: {
      name: String(row.author_name || ''),
      ...(row.author_avatar ? { avatar: String(row.author_avatar) } : {}),
    },
    status: row.status === 'published' ? 'published' : 'draft',
    publishedAt: row.published_at
      ? new Date(row.published_at).toISOString()
      : null,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    createdBy: row.created_by != null ? Number(row.created_by) : null,
    updatedBy: row.updated_by != null ? Number(row.updated_by) : null,
  };
}

function normalizeSlug(id: string): string {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
}

export const BlogPostRepo = {
  normalizeSlug,

  async countAll(): Promise<number> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM blog_posts`
    );
    return Number(rows[0]?.total || 0);
  },

  async list(opts?: {
    status?: BlogPostStatus | 'all';
  }): Promise<BlogPostRecord[]> {
    const db = await openSql();
    const status = opts?.status ?? 'all';
    const [rows] =
      status === 'all'
        ? await db.execute<RowDataPacket[]>(
            `SELECT * FROM blog_posts
             ORDER BY sort_order ASC, published_at DESC, updated_at DESC`
          )
        : await db.execute<RowDataPacket[]>(
            `SELECT * FROM blog_posts
             WHERE status = ?
             ORDER BY sort_order ASC, published_at DESC, updated_at DESC`,
            [status]
          );
    return rows.map(mapRow);
  },

  async getById(id: string): Promise<BlogPostRecord | null> {
    const db = await openSql();
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT * FROM blog_posts WHERE id = ? LIMIT 1`,
      [String(id)]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async insert(
    input: BlogPostWriteInput,
    actorUserId?: number | null
  ): Promise<BlogPostRecord> {
    const id = normalizeSlug(input.id);
    if (!id) throw new Error('Post id (slug) is required');
    const status: BlogPostStatus =
      input.status === 'published' ? 'published' : 'draft';
    const publishedAt =
      status === 'published'
        ? input.publishedAt
          ? new Date(input.publishedAt)
          : new Date()
        : null;

    const db = await openSql();
    await db.execute<ResultSetHeader>(
      `INSERT INTO blog_posts
        (id, title, excerpt, content, date_display, read_time, tags_json,
         author_name, author_avatar, status, published_at, sort_order,
         created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(input.title || '').slice(0, 512),
        String(input.excerpt || ''),
        String(input.content || ''),
        String(input.date || '').slice(0, 64),
        String(input.readTime || '').slice(0, 32),
        JSON.stringify(Array.isArray(input.tags) ? input.tags : []),
        String(input.author?.name || '').slice(0, 255),
        input.author?.avatar
          ? String(input.author.avatar).slice(0, 512)
          : null,
        status,
        publishedAt,
        Number.isFinite(Number(input.sortOrder))
          ? Number(input.sortOrder)
          : 0,
        actorUserId != null ? Number(actorUserId) : null,
        actorUserId != null ? Number(actorUserId) : null,
      ]
    );
    const created = await this.getById(id);
    if (!created) throw new Error('Failed to load created post');
    return created;
  },

  async update(
    id: string,
    patch: Partial<BlogPostWriteInput>,
    actorUserId?: number | null
  ): Promise<BlogPostRecord | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const next: BlogPostWriteInput = {
      id: existing.id,
      title: patch.title ?? existing.title,
      excerpt: patch.excerpt ?? existing.excerpt,
      content: patch.content ?? existing.content,
      date: patch.date ?? existing.date,
      readTime: patch.readTime ?? existing.readTime,
      tags: patch.tags ?? existing.tags,
      author: patch.author ?? existing.author,
      status: patch.status ?? existing.status,
      sortOrder:
        patch.sortOrder !== undefined ? patch.sortOrder : existing.sortOrder,
      publishedAt:
        patch.publishedAt !== undefined
          ? patch.publishedAt
          : existing.publishedAt,
    };

    const status: BlogPostStatus =
      next.status === 'published' ? 'published' : 'draft';
    let publishedAt: Date | null = null;
    if (status === 'published') {
      publishedAt = next.publishedAt
        ? new Date(next.publishedAt)
        : existing.publishedAt
          ? new Date(existing.publishedAt)
          : new Date();
    }

    const db = await openSql();
    await db.execute<ResultSetHeader>(
      `UPDATE blog_posts SET
         title = ?, excerpt = ?, content = ?, date_display = ?, read_time = ?,
         tags_json = ?, author_name = ?, author_avatar = ?, status = ?,
         published_at = ?, sort_order = ?, updated_by = ?
       WHERE id = ?`,
      [
        String(next.title || '').slice(0, 512),
        String(next.excerpt || ''),
        String(next.content || ''),
        String(next.date || '').slice(0, 64),
        String(next.readTime || '').slice(0, 32),
        JSON.stringify(Array.isArray(next.tags) ? next.tags : []),
        String(next.author?.name || '').slice(0, 255),
        next.author?.avatar
          ? String(next.author.avatar).slice(0, 512)
          : null,
        status,
        publishedAt,
        Number.isFinite(Number(next.sortOrder)) ? Number(next.sortOrder) : 0,
        actorUserId != null ? Number(actorUserId) : null,
        existing.id,
      ]
    );
    return this.getById(existing.id);
  },

  async delete(id: string): Promise<boolean> {
    const db = await openSql();
    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM blog_posts WHERE id = ?`,
      [String(id)]
    );
    return result.affectedRows > 0;
  },
};
