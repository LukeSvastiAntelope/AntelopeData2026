import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/app/utils/auth/require-user'

/**
 * Image generation endpoint — LLM gateway is Anthropic-only and does not
 * include an image model. Return 503 until a dedicated image provider is wired.
 */
export async function POST(req: NextRequest) {
  const auth = requireUserId(req)
  if (typeof auth !== 'string') return auth

  try {
    await req.json()
  } catch {
    /* ignore body parse */
  }

  return NextResponse.json(
    {
      status: false,
      message:
        'Image generation is not available on the Anthropic-only AI gateway. Use an uploaded asset instead.',
    },
    { status: 503 }
  )
}
