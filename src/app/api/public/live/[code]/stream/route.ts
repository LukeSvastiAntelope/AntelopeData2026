import { NextRequest } from 'next/server';
import { LiveRepo } from '@/app/utils/database/live-repo';
import {
  getLiveSessionChannel,
  type LiveChannelMessage,
} from '@/app/utils/live/session-channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/live/[code]/stream
 * Scoped SSE channel for one live session (screen + optional phone clients).
 * Short-poll fallback is the /snapshot route — clients switch if EventSource fails.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await context.params;
  const found = await LiveRepo.getLiveSessionByCode(raw);
  if (!found) {
    return new Response(JSON.stringify({ status: false, message: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const code = found.session.code;
  const channel = getLiveSessionChannel();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: LiveChannelMessage | Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(msg)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Initial snapshot
      try {
        const snapshot = await LiveRepo.buildScreenSnapshot(code);
        send({
          type: 'snapshot',
          code,
          ts: new Date().toISOString(),
          snapshot,
        });
      } catch (err) {
        send({
          type: 'error',
          code,
          ts: new Date().toISOString(),
          message: err instanceof Error ? err.message : 'snapshot failed',
        });
      }

      unsubscribe = channel.subscribe(code, (msg) => send(msg));

      heartbeat = setInterval(() => {
        send({
          type: 'ping',
          code,
          ts: new Date().toISOString(),
        });
      }, 15000);

      request.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
