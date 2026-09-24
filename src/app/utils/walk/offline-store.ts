/**
 * IndexedDB offline store for MiniVAN Walk PWA.
 * Holds turf snapshot + pending door outcomes + GPS breadcrumbs (client_event_id keyed).
 */

const DB_NAME = 'antelope-walk-v1';
const DB_VERSION = 2;
const STORE_TURF = 'turf';
const STORE_QUEUE = 'queue';
const STORE_GPS = 'gps';

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
  canvasser: { name: string | null; paidTracking?: boolean };
  gps?: {
    enabled: boolean;
    disclosure?: string;
    minIntervalSec?: number;
    minDistanceM?: number;
  };
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

export type QueuedBreadcrumb = {
  clientEventId: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
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
      if (!db.objectStoreNames.contains(STORE_GPS)) {
        const g = db.createObjectStore(STORE_GPS, { keyPath: 'clientEventId' });
        g.createIndex('byToken', 'token', { unique: false });
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
  let accepted = 0;
  let failed = 0;

  if (pending.length) {
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
        failed += pending.length;
      } else {
        const synced: string[] = [];
        for (const r of data.results || []) {
          if (r.ok) {
            synced.push(r.clientEventId);
            await markQueueState(r.clientEventId, 'synced');
            accepted += 1;
          } else {
            await markQueueState(r.clientEventId, 'error', r.error || 'failed');
            failed += 1;
          }
        }
        await removeSynced(synced);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'network';
      for (const ev of pending) {
        await markQueueState(ev.clientEventId, 'error', msg);
      }
      failed += pending.length;
    }
  }

  const gpsResult = await flushGpsQueue(token);
  accepted += gpsResult.accepted;
  failed += gpsResult.failed;

  const leftOutcomes = (await listQueue(token)).filter(
    (e) => e.syncState === 'pending' || e.syncState === 'error'
  ).length;
  const leftGps = (await listGpsQueue(token)).filter(
    (e) => e.syncState === 'pending' || e.syncState === 'error'
  ).length;

  return {
    accepted,
    failed,
    pendingLeft: leftOutcomes + leftGps,
  };
}

export async function enqueueBreadcrumb(
  token: string,
  point: Omit<QueuedBreadcrumb, 'syncState' | 'createdAt' | 'lastError'> & {
    syncState?: QueuedBreadcrumb['syncState'];
  }
): Promise<QueuedBreadcrumb> {
  const row: QueuedBreadcrumb & { token: string } = {
    token,
    clientEventId: point.clientEventId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyM: point.accuracyM ?? null,
    recordedAt: point.recordedAt,
    createdAt: new Date().toISOString(),
    syncState: point.syncState || 'pending',
    lastError: null,
  };
  const db = await openDb();
  const tx = db.transaction(STORE_GPS, 'readwrite');
  tx.objectStore(STORE_GPS).put(row);
  await txDone(tx);
  db.close();
  return row;
}

export async function listGpsQueue(
  token: string
): Promise<(QueuedBreadcrumb & { token: string })[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_GPS, 'readonly');
  const idx = tx.objectStore(STORE_GPS).index('byToken');
  const req = idx.getAll(token);
  const rows = await new Promise<(QueuedBreadcrumb & { token: string })[]>(
    (resolve, reject) => {
      req.onsuccess = () => resolve((req.result as any[]) || []);
      req.onerror = () => reject(req.error);
    }
  );
  await txDone(tx);
  db.close();
  return rows;
}

async function markGpsState(
  clientEventId: string,
  syncState: QueuedBreadcrumb['syncState'],
  lastError?: string | null
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_GPS, 'readwrite');
  const store = tx.objectStore(STORE_GPS);
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

async function removeGpsSynced(clientEventIds: string[]): Promise<void> {
  if (!clientEventIds.length) return;
  const db = await openDb();
  const tx = db.transaction(STORE_GPS, 'readwrite');
  const store = tx.objectStore(STORE_GPS);
  for (const id of clientEventIds) store.delete(id);
  await txDone(tx);
  db.close();
}

/** Flush pending GPS breadcrumbs to /api/public/walk/[token]/breadcrumbs */
export async function flushGpsQueue(token: string): Promise<{
  accepted: number;
  failed: number;
}> {
  const all = await listGpsQueue(token);
  const pending = all.filter(
    (e) => e.syncState === 'pending' || e.syncState === 'error'
  );
  if (!pending.length) return { accepted: 0, failed: 0 };

  for (const e of pending) {
    await markGpsState(e.clientEventId, 'syncing');
  }

  try {
    const res = await fetch(
      `/api/public/walk/${encodeURIComponent(token)}/breadcrumbs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: pending.map((e) => ({
            clientEventId: e.clientEventId,
            latitude: e.latitude,
            longitude: e.longitude,
            accuracyM: e.accuracyM,
            recordedAt: e.recordedAt,
          })),
        }),
      }
    );
    const data = await res.json();
    if (!res.ok || !data.status) {
      for (const e of pending) {
        await markGpsState(
          e.clientEventId,
          'error',
          data.message || `HTTP ${res.status}`
        );
      }
      return { accepted: 0, failed: pending.length };
    }
    // Server accepted/skipped as a batch — treat all as synced when no per-point errors
    const synced = pending.map((e) => e.clientEventId);
    for (const id of synced) await markGpsState(id, 'synced');
    await removeGpsSynced(synced);
    return {
      accepted: Number(data.accepted) || synced.length,
      failed: Number(data.errors?.length) || 0,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network';
    for (const ev of pending) {
      await markGpsState(ev.clientEventId, 'error', msg);
    }
    return { accepted: 0, failed: pending.length };
  }
}

/** Haversine meters for client throttle. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
