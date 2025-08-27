import { NextRequest, NextResponse } from "next/server";
import { ChannelRepo } from "@/app/utils/database/channel-repo";

async function getMe(botToken: string) {
  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  const res = await fetch(url);
  if (!res.ok) return null;
  try {
    const data = await res.json();
    return data?.result || null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(userIdHeader, 10)
    const integration = await ChannelRepo.getUserTelegramIntegration(userId)
    if (!integration) {
      return NextResponse.json({ status: true, connected: false })
    }
    let botUsername: string | null = null
    const token: string | undefined = (integration as any)?.credentials?.botToken
    if (integration.settings?.botUsername) {
      botUsername = integration.settings.botUsername
    } else if (token) {
      const me = await getMe(token)
      botUsername = me?.username || null
    }

    return NextResponse.json({
      status: true,
      connected: (integration as any).status === 'connected',
      settings: integration.settings || {},
      botUsername
    })
  } catch (error) {
    console.error('Telegram status error:', error)
    return NextResponse.json({ status: false, message: 'Internal error' }, { status: 500 })
  }
}


