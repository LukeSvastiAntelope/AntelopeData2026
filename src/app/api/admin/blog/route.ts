import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import {
  createBlogPost,
  listAdminBlogPosts,
} from '@/app/utils/services/content-cms-service';

/**
 * GET /api/admin/blog — list all posts (draft + published).
 * POST /api/admin/blog — create a post.
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const posts = await listAdminBlogPosts();

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'blog.list',
      targetType: 'blog_post',
      metadata: { count: posts.length },
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true, posts, total: posts.length });
  } catch (error) {
    console.error('[admin/blog GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || body.slug || '').trim();
    const title = String(body.title || '').trim();
    if (!id || !title) {
      return NextResponse.json(
        { status: false, message: 'id (slug) and title are required' },
        { status: 400 }
      );
    }

    const post = await createBlogPost(
      {
        id,
        title,
        excerpt: String(body.excerpt || ''),
        content: String(body.content || ''),
        date: String(body.date || ''),
        readTime: String(body.readTime || ''),
        tags: Array.isArray(body.tags)
          ? body.tags.map(String)
          : String(body.tags || '')
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean),
        author: {
          name: String(body.author?.name || body.authorName || 'Antelope'),
          ...(body.author?.avatar || body.authorAvatar
            ? {
                avatar: String(
                  body.author?.avatar || body.authorAvatar || ''
                ),
              }
            : {}),
        },
        status: body.status === 'published' ? 'published' : 'draft',
        sortOrder:
          body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      },
      gate.numericUserId
    );

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'blog.create',
      targetType: 'blog_post',
      targetId: post.id,
      metadata: { status: post.status, title: post.title },
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true, post }, { status: 201 });
  } catch (error) {
    console.error('[admin/blog POST]', error);
    const message = error instanceof Error ? error.message : 'Failed';
    const conflict =
      typeof message === 'string' &&
      (message.includes('Duplicate') || message.includes('ER_DUP'));
    return NextResponse.json(
      { status: false, message },
      { status: conflict ? 409 : 500 }
    );
  }
}
