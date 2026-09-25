/**
 * Live L3 — scoped per-session realtime bus.
 *
 * Small interface so an in-process memory bus can be swapped for Redis
 * (or another pub/sub) for large online briefs without rewriting clients.
 * NOT an app-wide realtime layer — session codes only.
 */

export type LiveChannelMessage = {
  /** Monotonic-ish server time for clients */
  ts: string;
  type: 'snapshot' | 'ping' | 'error';
  /** Opaque session join code (channel key) */
  code: string;
  /** Full screen projection when type=snapshot */
  snapshot?: unknown;
  message?: string;
};

export type LiveChannelListener = (msg: LiveChannelMessage) => void;

export interface LiveSessionChannel {
  /** Publish to everyone subscribed to this session code. */
  publish(code: string, msg: Omit<LiveChannelMessage, 'code' | 'ts'> & { ts?: string }): void;
  /** Subscribe; returns unsubscribe. */
  subscribe(code: string, listener: LiveChannelListener): () => void;
  /** Approximate subscriber count (memory bus only; Redis may return -1). */
  subscriberCount(code: string): number;
}

function normalizeCode(code: string): string {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** In-process pub/sub — fine for single-node / small rooms. */
export function createMemoryLiveSessionChannel(): LiveSessionChannel {
  const rooms = new Map<string, Set<LiveChannelListener>>();

  return {
    publish(code, msg) {
      const key = normalizeCode(code);
      if (!key) return;
      const listeners = rooms.get(key);
      if (!listeners?.size) return;
      const full: LiveChannelMessage = {
        ...msg,
        code: key,
        ts: msg.ts || new Date().toISOString(),
      };
      for (const fn of Array.from(listeners)) {
        try {
          fn(full);
        } catch (err) {
          console.error('[live-channel listener]', err);
        }
      }
    },
    subscribe(code, listener) {
      const key = normalizeCode(code);
      if (!key) return () => undefined;
      let set = rooms.get(key);
      if (!set) {
        set = new Set();
        rooms.set(key, set);
      }
      set.add(listener);
      return () => {
        set!.delete(listener);
        if (set!.size === 0) rooms.delete(key);
      };
    },
    subscriberCount(code) {
      return rooms.get(normalizeCode(code))?.size ?? 0;
    },
  };
}

/**
 * Placeholder for a Redis-backed channel (large multi-instance briefs).
 * Not wired — swap `getLiveSessionChannel()` to return this when REDIS_URL is set.
 */
export function createRedisLiveSessionChannel(_redisUrl: string): LiveSessionChannel {
  throw new Error(
    'Redis LiveSessionChannel not implemented — use memory bus or add ioredis adapter'
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __antelopeLiveSessionChannel: LiveSessionChannel | undefined;
}

/** Process-singleton memory channel (survives HMR better via globalThis). */
export function getLiveSessionChannel(): LiveSessionChannel {
  if (process.env.LIVE_SESSION_CHANNEL === 'redis' && process.env.REDIS_URL) {
    // Reserved: wire Redis adapter here without changing SSE/clients.
    // return createRedisLiveSessionChannel(process.env.REDIS_URL)
  }
  if (!globalThis.__antelopeLiveSessionChannel) {
    globalThis.__antelopeLiveSessionChannel = createMemoryLiveSessionChannel();
  }
  return globalThis.__antelopeLiveSessionChannel;
}

/** Notify all screen/participant subscribers with a fresh snapshot payload. */
export function publishLiveSnapshot(code: string, snapshot: unknown): void {
  getLiveSessionChannel().publish(code, {
    type: 'snapshot',
    snapshot,
  });
}
