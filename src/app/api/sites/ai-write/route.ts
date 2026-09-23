/**
 * POST /api/sites/ai-write — suggest copy for a named text slot.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getOrgCampaignContext,
  requireWebsiteAccess,
} from '@/app/utils/services/site-access';
import {
  isSiteAiSlotPath,
  writeSiteSlotWithAi,
} from '@/app/utils/services/site-ai-write';
import { defaultSiteContent, type SiteContent } from '@/app/utils/types/site';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const access = await requireWebsiteAccess(
      req,
      body?.organizationId != null ? Number(body.organizationId) : null
    );
    if (access instanceof NextResponse) return access;

    if (!isSiteAiSlotPath(body?.slotPath)) {
      return NextResponse.json(
        { status: false, message: 'slotPath required' },
        { status: 400 }
      );
    }

    const content: SiteContent =
      body?.content && typeof body.content === 'object'
        ? defaultSiteContent(body.content as Partial<SiteContent>)
        : defaultSiteContent();

    const org = await getOrgCampaignContext(access.organizationId);
    const result = await writeSiteSlotWithAi({
      slotPath: body.slotPath,
      content,
      org,
    });

    return NextResponse.json({
      status: true,
      slotPath: body.slotPath,
      result,
    });
  } catch (error) {
    console.error('[api/sites/ai-write]', error);
    const message =
      error instanceof Error ? error.message : 'AI write failed';
    const missingKey =
      /api key|ANTHROPIC|authentication/i.test(message) ||
      message.includes('401');
    return NextResponse.json(
      {
        status: false,
        message: missingKey
          ? 'AI writing is unavailable (Anthropic key not configured)'
          : message,
      },
      { status: missingKey ? 503 : 500 }
    );
  }
}
