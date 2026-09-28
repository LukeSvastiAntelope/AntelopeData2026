import { NextRequest, NextResponse } from 'next/server';
import { pricingBotStore } from '@/app/api/pricing-bot/_store';
import {
  requireSuperAdmin,
  clientIp,
} from '@/app/utils/auth/require-super-admin';
import { writeAdminAuditLog } from '@/app/utils/database/admin-audit-repo';

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const store = pricingBotStore();
  await writeAdminAuditLog({
    actorUserId: gate.numericUserId,
    action: 'pricing_bot.stats',
    targetType: 'system',
    metadata: {
      activeQuoteSessions: store.quotes.size,
      activeReferralTokens: store.referrals.size,
    },
    ip: clientIp(req),
  });

  return NextResponse.json({
    status: true,
    stats: store.stats,
    activeQuoteSessions: store.quotes.size,
    activeReferralTokens: store.referrals.size,
  });
}
