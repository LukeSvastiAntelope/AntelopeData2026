/**
 * Admin A3 — content CMS service: seed-on-empty + public/admin accessors.
 */

import { BLOG_POSTS } from '@/data/blog-posts';
import {
  BlogPostRepo,
  type BlogPostRecord,
  type BlogPostWriteInput,
} from '@/app/utils/database/blog-post-repo';
import {
  ContentSheetRepo,
  DEFAULT_PRICING_SHEET,
  coercePricingSheet,
  type ContentSheetRecord,
  type PricingSheetContent,
} from '@/app/utils/database/content-sheet-repo';
import type { BlogPost } from '@/types/blog';

let seedPromise: Promise<void> | null = null;

async function seedIfEmpty(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const count = await BlogPostRepo.countAll();
        if (count === 0) {
          let order = 0;
          for (const post of BLOG_POSTS) {
            await BlogPostRepo.insert({
              id: post.id,
              title: post.title,
              excerpt: post.excerpt,
              content: post.content || '',
              date: post.date,
              readTime: post.readTime,
              tags: post.tags,
              author: post.author,
              status: 'published',
              sortOrder: order++,
              publishedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error('[content-cms] blog seed failed', err);
      }

      try {
        const existing = await ContentSheetRepo.get('pricing');
        if (!existing) {
          await ContentSheetRepo.upsert({
            sheetKey: 'pricing',
            title: 'Pricing & features',
            content: DEFAULT_PRICING_SHEET,
          });
        }
      } catch (err) {
        console.error('[content-cms] pricing sheet seed failed', err);
      }
    })().finally(() => {
      // Allow retry if seed failed before any rows existed.
      seedPromise = null;
    });
  }
  await seedPromise;
}

export function toPublicBlogPost(record: BlogPostRecord): BlogPost {
  return {
    id: record.id,
    title: record.title,
    excerpt: record.excerpt,
    content: record.content,
    date: record.date,
    readTime: record.readTime,
    tags: record.tags,
    author: record.author,
  };
}

export async function ensureContentSeeded(): Promise<void> {
  await seedIfEmpty();
}

export async function listPublishedBlogPosts(): Promise<BlogPost[]> {
  await seedIfEmpty();
  const rows = await BlogPostRepo.list({ status: 'published' });
  return rows.map(toPublicBlogPost);
}

export async function getPublishedBlogPost(
  id: string
): Promise<BlogPost | null> {
  await seedIfEmpty();
  const row = await BlogPostRepo.getById(id);
  if (!row || row.status !== 'published') return null;
  return toPublicBlogPost(row);
}

export async function listAdminBlogPosts(): Promise<BlogPostRecord[]> {
  await seedIfEmpty();
  return BlogPostRepo.list({ status: 'all' });
}

export async function getAdminBlogPost(
  id: string
): Promise<BlogPostRecord | null> {
  await seedIfEmpty();
  return BlogPostRepo.getById(id);
}

export async function createBlogPost(
  input: BlogPostWriteInput,
  actorUserId: number
): Promise<BlogPostRecord> {
  await seedIfEmpty();
  return BlogPostRepo.insert(input, actorUserId);
}

export async function updateBlogPost(
  id: string,
  patch: Partial<BlogPostWriteInput>,
  actorUserId: number
): Promise<BlogPostRecord | null> {
  return BlogPostRepo.update(id, patch, actorUserId);
}

export async function deleteBlogPost(id: string): Promise<boolean> {
  return BlogPostRepo.delete(id);
}

export async function getPricingSheet(): Promise<PricingSheetContent> {
  await seedIfEmpty();
  const sheet = await ContentSheetRepo.get('pricing');
  return coercePricingSheet(sheet?.content);
}

export async function getAdminContentSheet(
  key: string
): Promise<ContentSheetRecord | null> {
  await seedIfEmpty();
  return ContentSheetRepo.get(key);
}

export async function upsertContentSheet(input: {
  sheetKey: string;
  title: string;
  content: unknown;
  updatedBy: number;
}): Promise<ContentSheetRecord> {
  await seedIfEmpty();
  if (input.sheetKey === 'pricing') {
    return ContentSheetRepo.upsert({
      sheetKey: 'pricing',
      title: input.title || 'Pricing & features',
      content: coercePricingSheet(input.content),
      updatedBy: input.updatedBy,
    });
  }
  return ContentSheetRepo.upsert(input);
}
