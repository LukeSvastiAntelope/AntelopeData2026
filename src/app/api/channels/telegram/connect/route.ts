import { NextRequest, NextResponse } from "next/server";
import { ChannelRepo } from "@/app/utils/database/channel-repo";

export const runtime = 'nodejs';
export const maxDuration = 30;

async function setTelegramWebhook(botToken: string, webhookUrl: string, secretToken: string) {
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: secretToken })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram setWebhook failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function getMe(botToken: string) {
  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram getMe failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id');
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { botToken } = await req.json();
    if (!botToken) {
      return NextResponse.json({ status: false, message: 'Missing botToken' }, { status: 400 });
    }

    // Verify the token
    const me = await getMe(botToken);
    if (!me?.ok) {
      return NextResponse.json({ status: false, message: 'Invalid bot token' }, { status: 400 });
    }

    // Compute webhook URL; Next.js route path
    const baseUrl = process.env.PUBLIC_BASE_URL || '';
    if (!baseUrl) {
      return NextResponse.json({ status: false, message: 'PUBLIC_BASE_URL not configured' }, { status: 500 });
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || Math.random().toString(36).slice(2);
    const webhookUrl = `${baseUrl}/api/channels/telegram/webhook`;

    await setTelegramWebhook(botToken, webhookUrl, secret);

    // Persist for current user
    await ChannelRepo.upsertUserTelegramIntegration(parseInt(userIdHeader, 10), botToken, { webhookUrl }, secret)

    return NextResponse.json({ status: true, bot: me?.result, webhookUrl });
  } catch (error) {
    console.error('Telegram connect error:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: false, message: `Internal error during Telegram connect: ${detail}` }, { status: 500 });
  }
}


