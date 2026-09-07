import { NextRequest, NextResponse } from "next/server";
import { ChannelRepo } from "@/app/utils/database/channel-repo";

/**
 * POST /api/channels/telegram/test
 *
 * Telegram bots can't message a user who hasn't started a chat with them
 * first, so a real "send me a test message" isn't possible here without
 * the admin already having messaged the bot. This instead re-verifies the
 * stored bot token is still valid (Telegram's getMe), which is what
 * actually breaks silently (revoked/regenerated tokens).
 */
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader, 10);
    const integration = await ChannelRepo.getUserTelegramIntegration(userId);
    const token: string | undefined = (integration as any)?.credentials?.botToken;
    if (!integration || !token) {
      return NextResponse.json({ status: false, message: 'No Telegram bot connected yet.' }, { status: 404 });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return NextResponse.json({ status: false, message: 'Bot token is no longer valid — reconnect with a fresh token.' });
    }

    return NextResponse.json({
      status: true,
      message: `Connection verified — @${data.result.username} is reachable.`,
      botUsername: data.result.username,
    });
  } catch (error) {
    console.error('Telegram test error:', error);
    return NextResponse.json({ status: false, message: 'Could not reach Telegram.' }, { status: 500 });
  }
}
