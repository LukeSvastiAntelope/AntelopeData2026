/**
 * Publish a fresh screen snapshot on the scoped session channel.
 */
import { LiveRepo } from '@/app/utils/database/live-repo';
import { publishLiveSnapshot } from '@/app/utils/live/session-channel';

export async function notifyLiveSession(code: string): Promise<void> {
  try {
    const snapshot = await LiveRepo.buildScreenSnapshot(code);
    if (!snapshot) return;
    publishLiveSnapshot(code, snapshot);
  } catch (err) {
    console.error('[notifyLiveSession]', err);
  }
}

export async function notifyLiveSessionById(
  sessionId: number,
  organizationId: number
): Promise<void> {
  const session = await LiveRepo.getSessionById(sessionId, organizationId);
  if (!session) return;
  await notifyLiveSession(session.code);
}
