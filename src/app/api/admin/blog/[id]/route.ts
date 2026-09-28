import { NextRequest, NextResponse } from 'next/server';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';
import {
  deleteBlogPost,
  getAdminBlogPost,
  updateBlogPost,
} from '@/app/utils/services/content-cms-service';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/blog/[id]
 * PATCH /api/admin/blog/[id]
 * DELETE /api/admin/blog/[id]
 */
export async function GET(req: NextRequest, context: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { id } = await context.params;
    const post = await getAdminBlogPost(id);
    if (!post) {
      return NextResponse.json(
        { status: false, message: 'Not found' },
        { status: 404 }
      );
    }

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'blog.get',
      targetType: 'blog_post',
      targetId: id,
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true, post });
  } catch (error) {
    console.error('[admin/blog/[id] GET]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.excerpt !== undefined) patch.excerpt = String(body.excerpt);
    if (body.content !== undefined) patch.content = String(body.content);
    if (body.date !== undefined) patch.date = String(body.date);
    if (body.readTime !== undefined) patch.readTime = String(body.readTime);
    if (body.tags !== undefined) {
      patch.tags = Array.isArray(body.tags)
        ? body.tags.map(String)
        : String(body.tags || '')
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
    }
    if (body.author !== undefined || body.authorName !== undefined) {
      patch.author = {
        name: String(body.author?.name || body.authorName || ''),
        ...(body.author?.avatar || body.authorAvatar
          ? {
              avatar: String(body.author?.avatar || body.authorAvatar || ''),
            }
          : {}),
      };
    }
    if (body.status !== undefined) {
      patch.status = body.status === 'published' ? 'published' : 'draft';
    }
    if (body.sortOrder !== undefined) {
      patch.sortOrder = Number(body.sortOrder);
    }
    if (body.publishedAt !== undefined) {
      patch.publishedAt = body.publishedAt;
    }

    const post = await updateBlogPost(
      id,
      patch as Parameters<typeof updateBlogPost>[1],
      gate.numericUserId
    );
    if (!post) {
      return NextResponse.json(
        { status: false, message: 'Not found' },
        { status: 404 }
      );
    }

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'blog.update',
      targetType: 'blog_post',
      targetId: id,
      metadata: { status: post.status, fields: Object.keys(patch) },
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true, post });
  } catch (error) {
    console.error('[admin/blog/[id] PATCH]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: Ctx) {
  try {
    const gate = await requireSuperAdmin(req);
    if (gate instanceof NextResponse) return gate;

    const { id } = await context.params;
    const ok = await deleteBlogPost(id);
    if (!ok) {
      return NextResponse.json(
        { status: false, message: 'Not found' },
        { status: 404 }
      );
    }

    await writeAdminAuditLog({
      actorUserId: gate.numericUserId,
      action: 'blog.delete',
      targetType: 'blog_post',
      targetId: id,
      ip: clientIp(req),
    });

    return NextResponse.json({ status: true });
  } catch (error) {
    console.error('[admin/blog/[id] DELETE]', error);
    return NextResponse.json(
      {
        status: false,
        message: error instanceof Error ? error.message : 'Failed',
      },
      { status: 500 }
    );
  }
}
