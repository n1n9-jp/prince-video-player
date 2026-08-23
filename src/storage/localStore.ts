import { applyAutoTags } from "../catalog/tagging";
import {
  isDangerousReplace,
  isStarterShaped,
  mergeStates,
  parseState,
  pickCanonical,
  richness,
  withPlaylist,
} from "./parse";
import { applyStarterIfNeeded } from "./seed";
import { emptyState, stripUnplayableFromPlaylists, type AppState, type Store } from "./types";

export const STORAGE_KEY = "prince-video-player";
export const BACKUP_KEY = "prince-video-player:backup";
export const CORRUPT_KEY = "prince-video-player:corrupt";
const IDB_NAME = "prince-video-player";
const IDB_STORE = "kv";
const IDB_KEY = "state";

let restoredNotice: string | null = null;

export {
  chooseServerLibrary,
  isDangerousReplace,
  isStarterShaped,
  mergeStates,
  parseState,
  pickCanonical,
  playlistItemCount,
  richness,
  videoCount,
} from "./parse";

function withAutoTags(state: AppState): AppState {
  try {
    return { ...state, videoTags: applyAutoTags(state.videos, state.videoTags) };
  } catch {
    return state;
  }
}

export function hydrateState(parsed: AppState): AppState {
  return withAutoTags(stripUnplayableFromPlaylists(withPlaylist(parsed)));
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function parseRaw(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    return parseState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

type Candidate = { source: string; state: AppState; raw: string };

function readStorageCandidates(): Candidate[] {
  const out: Candidate[] = [];
  if (typeof localStorage === "undefined") return out;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = safeGet(key);
      if (!raw || raw.length < 20 || raw[0] !== "{") continue;
      const parsed = parseRaw(raw);
      if (!parsed) continue;
      if (Object.keys(parsed.videos).length === 0 && parsed.playlists.every((p) => p.videoIds.length === 0)) continue;
      out.push({ source: key, state: parsed, raw });
    }
  } catch {
    return out;
  }
  return out;
}

function pickRichest(candidates: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (!best || richness(candidate.state) > richness(best.state)) best = candidate;
  }
  return best;
}

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function readIndexedDb(): Promise<AppState | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const get = tx.objectStore(IDB_STORE).get(IDB_KEY);
      get.onsuccess = () => {
        const parsed = parseState(get.result);
        db.close();
        resolve(parsed);
      };
      get.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeIndexedDb(state: AppState): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(state, IDB_KEY);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  } catch {
    db.close();
  }
}

function persistPrimary(state: AppState): void {
  const raw = JSON.stringify(state);
  safeSet(STORAGE_KEY, raw);
  void writeIndexedDb(state);
}

export function takeRestoredNotice(): string | null {
  const notice = restoredNotice;
  restoredNotice = null;
  return notice;
}

export function exportJson(state: AppState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function loadFromStorage(): AppState {
  const primaryRaw = safeGet(STORAGE_KEY);
  const backupRaw = safeGet(BACKUP_KEY);
  const candidates = readStorageCandidates();
  const richest = pickRichest(candidates);
  const primary = parseRaw(primaryRaw);

  if (richest && (!primary || richness(richest.state) > richness(primary))) {
    restoredNotice =
      richest.source === BACKUP_KEY
        ? "バックアップからライブラリを復元しました。"
        : "このブラウザに残っていた以前のライブラリを復元しました。";
    if (primaryRaw && primary && richest.source !== BACKUP_KEY && !isStarterShaped(primary)) {
      safeSet(BACKUP_KEY, primaryRaw);
    }
    persistPrimary(hydrateState(richest.state));
    return hydrateState(richest.state);
  }

  if (primary) return hydrateState(primary);
  if (primaryRaw) safeSet(CORRUPT_KEY, primaryRaw);

  const backup = parseRaw(backupRaw);
  if (backup) {
    restoredNotice = "バックアップからライブラリを復元しました。";
    persistPrimary(hydrateState(backup));
    return hydrateState(backup);
  }

  return hydrateState(emptyState());
}

function saveState(state: AppState, options?: { force?: boolean }): void {
  const primaryRaw = safeGet(STORAGE_KEY);
  const existing = parseRaw(primaryRaw);

  if (primaryRaw && !existing && isStarterShaped(state) && !options?.force) {
    safeSet(BACKUP_KEY, primaryRaw);
    return;
  }

  if (existing && isDangerousReplace(existing, state) && !options?.force) {
    if (primaryRaw) safeSet(BACKUP_KEY, primaryRaw);
    return;
  }

  if (primaryRaw && existing && richness(existing) >= richness(state)) {
    safeSet(BACKUP_KEY, primaryRaw);
  } else if (primaryRaw && existing) {
    const backup = parseRaw(safeGet(BACKUP_KEY));
    if (!backup || richness(existing) >= richness(backup)) safeSet(BACKUP_KEY, primaryRaw);
  }

  persistPrimary(state);
}

export async function loadDurableBackup(): Promise<AppState | null> {
  const parsed = await readIndexedDb();
  return parsed ? hydrateState(parsed) : null;
}

export function seedEmptyLibrary(state: AppState): AppState {
  if (!isStarterShaped(state) || Object.keys(state.videos).length > 0) return hydrateState(state);
  return hydrateState(applyStarterIfNeeded(state));
}

export const localStore: Store & {
  parse: typeof parseState;
  merge: typeof mergeStates;
  exportJson: typeof exportJson;
  richness: typeof richness;
  isStarterShaped: typeof isStarterShaped;
  isDangerousReplace: typeof isDangerousReplace;
  pickCanonical: typeof pickCanonical;
  takeRestoredNotice: typeof takeRestoredNotice;
  loadDurableBackup: typeof loadDurableBackup;
  seedEmptyLibrary: typeof seedEmptyLibrary;
} = {
  load: loadFromStorage,
  save: saveState,
  parse: parseState,
  merge: mergeStates,
  exportJson,
  richness,
  isStarterShaped,
  isDangerousReplace,
  pickCanonical,
  takeRestoredNotice,
  loadDurableBackup,
  seedEmptyLibrary,
};
