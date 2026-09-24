/**
 * IndexedDB offline store for MiniVAN Walk PWA.
 * Holds turf snapshot + pending door outcomes (client_event_id keyed).
 */

const DB_NAME = 'antelope-walk-v1';
const DB_VERSION = 1;
const STORE_TURF = 'turf';
const STORE_QUEUE = 'queue';

export type WalkDoor = {
  voterGeoId: number;
  sortOrder: number;
  lat: number;
  lng: number;
  label: string;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  party?: string | null;
  fieldStatus?: string | null;
  notes?: string | null;
};

export type WalkSnapshot = {
  token: string;
  fetchedAt: string;
  expiresAt: string;
  turf: { id: number; label: string; addressCount: number };
  canvasser: { name: string | null };
  outcomes: Array<{ status: string; label: string }>;
  doors: WalkDoor[];
};

export type QueuedOutcome = {
  clientEventId: string;
  voterGeoId: number;
  status: string;
  party?: string | null;
  notes?: string | null;
  recordedAt: string;
  createdAt: string;
  syncState: 'pending' | 'syncing' | 'synced' | 'error';
  lastError?: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TURF)) {
        db.createObjectStore(STORE_TURF, { keyPath: 'token' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const q = db.createObjectStore(STORE_QUEUE, { keyPath: 'clientEventId' });
        q.createIndex('byTokenSync', ['token', 'syncState'], { unique: false });
        q.createIndex('byToken', 'token', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb open failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('idb tx failed'));
    tx.onabort = () => reject(tx.error || new Error('idb tx aborted'));
  });
}

export async function saveWalkSnapshot(snap: WalkSnapshot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_TURF, 'readwrite');
  tx.objectStore(STORE_TURF).put(snap);
  await txDone(tx);
  db.close();
}

export async function loadWalkSnapshot(
  token: string
): Promise<WalkSnapshot | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_TURF, 'readonly');
  const req = tx.objectStore(STORE_TURF).get(token);
  const row = await new Promise<WalkSnapshot | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as WalkSnapshot | undefined);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return row || null;
}

export async function enqueueOutcome(
  token: string,
  event: Omit<QueuedOutcome, 'syncState' | 'createdAt' | 'lastError'> & {
    syncState?: QueuedOutcome['syncState'];
  }
): Promise<QueuedOutcome> {
  const row: QueuedOutcome & { token: string } = {
    token,
    clientEventId: event.clientEventId,
    voterGeoId: event.voterGeoId,
    status: event.status,
    party: event.party ?? null,
    notes: event.notes ?? null,
    recordedAt: event.recordedAt,
    createdAt: new Date().toISOString(),
    syncState: event.syncState || 'pending',
    lastError: null,
  };
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(row);
  await txDone(tx);
  db.close();
  return row;
}

export async function listQueue(token: string): Promise<(QueuedOutcome & { token: string })[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readonly');
  const idx = tx.objectStore(STORE_QUEUE).index('byToken');
  const req = idx.getAll(token);
  const rows = await new Promise<(QueuedOutcome & { token: string })[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as any[]) || []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows;
}

export async function markQueueState(
  clientEventId: string,
  syncState: QueuedOutcome['syncState'],
  lastError?: string | null
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_QUEUE);
  const getReq = store.get(clientEventId);
  const existing = await new Promise<any>((resolve, reject) => {
    getReq.onsuccess = () => resolve(getReq.result);
    getReq.onerror = () => reject(getReq.error);
  });
  if (existing) {
    existing.syncState = syncState;
    existing.lastError = lastError ?? null;
    store.put(existing);
  }
  await txDone(tx);
  db.close();
}

export async function removeSynced(clientEventIds: string[]): Promise<void> {
  if (!clientEventIds.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_QUEUE);
  for (const id of clientEventIds) store.delete(id);
  await txDone(tx);
  db.close();
}

export async function applyLocalDoorStatus(
  token: string,
  voterGeoId: number,
  status: string,
  notes?: string | null
): Promise<void> {
  const snap = await loadWalkSnapshot(token);
  if (!snap) return;
  snap.doors = snap.doors.map((d) =>
    d.voterGeoId === voterGeoId
      ? { ...d, fieldStatus: status, notes: notes ?? d.notes }
      : d
  );
  snap.fetchedAt = new Date().toISOString();
  await saveWalkSnapshot(snap);
}

export function newClientEventId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  }
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Flush pending outcomes to /api/public/walk/[token]/sync */
export async function flushWalkQueue(token: string): Promise<{
  accepted: number;
  failed: number;
  pendingLeft: number;
}> {
  const all = await listQueue(token);
  const pending = all.filter(
    (e) => e.syncState === 'pending' || e.syncState === 'error'
  );
  if (!pending.length) {
    return { accepted: 0, failed: 0, pendingLeft: 0 };
  }

  for (const e of pending) {
    await markQueueState(e.clientEventId, 'syncing');
  }

  try {
    const res = await fetch(`/api/public/walk/${encodeURIComponent(token)}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: pending.map((e) => ({
          clientEventId: e.clientEventId,
          voterGeoId: e.voterGeoId,
          status: e.status,
          party: e.party,
          notes: e.notes,
          recordedAt: e.recordedAt,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.status) {
      for (const e of pending) {
        await markQueueState(
          e.clientEventId,
          'error',
          data.message || `HTTP ${res.status}`
        );
      }
      return {
        accepted: 0,
        failed: pending.length,
        pendingLeft: pending.length,
      };
    }

    const synced: string[] = [];
    for (const r of data.results || []) {
      if (r.ok) {
        synced.push(r.clientEventId);
        await markQueueState(r.clientEventId, 'synced');
      } else {
        await markQueueState(r.clientEventId, 'error', r.error || 'failed');
      }
    }
    await removeSynced(synced);
    const left = (await listQueue(token)).filter(
      (e) => e.syncState === 'pending' || e.syncState === 'error'
    ).length;
    return {
      accepted: Number(data.accepted) || synced.length,
      failed: Number(data.failed) || 0,
      pendingLeft: left,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network';
    for (const ev of pending) {
      await markQueueState(ev.clientEventId, 'error', msg);
    }
    return {
      accepted: 0,
      failed: pending.length,
      pendingLeft: pending.length,
    };
  }
}
