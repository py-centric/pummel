import type { ConfigFormat, PummelConfig } from '../types/pummel';

export interface ConfigSnapshot {
  id: string;
  label: string;
  specName: string;
  format: ConfigFormat;
  rawText: string;
  concurrency: number;
  scenarioCount: number;
  createdAt: string;
}

const DB_NAME = 'pummel-workspace-db';
const DB_VERSION = 1;
const STORE_NAME = 'config_snapshots';

export function createSnapshotRecord(params: {
  label: string;
  config: PummelConfig;
  format: ConfigFormat;
  rawText: string;
  now?: Date;
}): ConfigSnapshot {
  const now = params.now ?? new Date();
  const cleanLabel = params.label.trim() || `${params.config.name} (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
  const totalConcurrency =
    params.config.execution.reduce((sum, ex) => sum + ex.concurrency, 0) || 0;

  return {
    id: `snap-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    label: cleanLabel,
    specName: params.config.name,
    format: params.format,
    rawText: params.rawText,
    concurrency: totalConcurrency,
    scenarioCount: Object.keys(params.config.scenarios).length,
    createdAt: now.toISOString(),
  };
}

export function sortSnapshotsNewestFirst(
  snapshots: readonly ConfigSnapshot[]
): ConfigSnapshot[] {
  return [...snapshots].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

export function formatSnapshotTimestamp(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function openSnapshotDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open Pummel snapshot database.'));
  });
}

export async function listConfigSnapshots(): Promise<ConfigSnapshot[]> {
  const db = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const items = Array.isArray(req.result) ? (req.result as ConfigSnapshot[]) : [];
      resolve(sortSnapshotsNewestFirst(items));
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to read snapshots from IndexedDB.'));
    tx.oncomplete = () => db.close();
  });
}

export async function saveConfigSnapshot(snapshot: ConfigSnapshot): Promise<ConfigSnapshot> {
  const db = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(snapshot);

    req.onsuccess = () => resolve(snapshot);
    req.onerror = () => reject(req.error ?? new Error('Failed to save snapshot to IndexedDB.'));
    tx.oncomplete = () => db.close();
  });
}

export async function deleteConfigSnapshot(id: string): Promise<void> {
  const db = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to delete snapshot from IndexedDB.'));
    tx.oncomplete = () => db.close();
  });
}
