import { applyStarterIfNeeded, STARTER_VIDEOS } from "./seed";
import { applyAutoTags } from "../catalog/tagging";
import type { VideoTagging } from "../catalog/types";
import { emptyState, stripUnplayableFromPlaylists, type AppState, type PlayMode, type Playlist, type Store, type Video } from "./types";

export const STORAGE_KEY = "prince-video-player";
export const BACKUP_KEY = "prince-video-player:backup";
export const CORRUPT_KEY = "prince-video-player:corrupt";
const IDB_NAME = "prince-video-player";
const IDB_STORE = "kv";
const IDB_KEY = "state";

const STARTER_IDS = new Set(STARTER_VIDEOS.map((video) => video.id));

let restoredNotice: string | null = null;

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function isPlayMode(value: unknown): value is PlayMode {
  return value === "sequential" || value === "shuffle" || value === "leastPlayed";
}

function isVideo(value: unknown): value is Video {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.title === "string" &&
    typeof v.channelTitle === "string" &&
    typeof v.thumbnailUrl === "string"
  );
}

function collectVideos(raw: unknown): Record<string, Video> {
  const videos: Record<string, Video> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isVideo(item)) videos[item.id] = item;
    }
    return videos;
  }
  if (!raw || typeof raw !== "object") return videos;
  for (const video of Object.values(raw as Record<string, unknown>)) {
    if (isVideo(video)) videos[video.id] = video;
  }
  return videos;
}

function parsePlaylist(value: unknown): Playlist | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.name !== "string" || !Array.isArray(p.videoIds)) return null;
  return {
    id: p.id,
    name: p.name,
    videoIds: uniqueIds(p.videoIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  };
}

function parseWatchCounts(raw: unknown): Record<string, number> {
  const watchCounts: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return watchCounts;
  for (const [id, count] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof count === "number" ? count : typeof count === "string" ? Number(count) : NaN;
    if (!Number.isFinite(n) || n < 0) continue;
    watchCounts[id] = n;
  }
  return watchCounts;
}

function parseTagging(value: unknown): VideoTagging | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Record<string, unknown>;
  const songIds = Array.isArray(t.songIds) ? t.songIds.filter((id): id is string => typeof id === "string") : [];
  const releaseIds = Array.isArray(t.releaseIds)
    ? t.releaseIds.filter((id): id is string => typeof id === "string")
    : [];
  const source = t.source === "manual" ? "manual" : "auto";
  const confidence =
    t.confidence === "high" || t.confidence === "medium" || t.confidence === "low" ? t.confidence : "low";
  const concertId = typeof t.concertId === "string" ? t.concertId : undefined;
  if (songIds.length === 0 && !concertId) return null;
  return { songIds, releaseIds, source, confidence, concertId };
}

export function parseState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!("videos" in s) && !("playlists" in s)) return null;
  const videos = collectVideos(s.videos);
  const playlists = Array.isArray(s.playlists)
    ? s.playlists.map(parsePlaylist).filter((p): p is Playlist => p !== null)
    : [];
  const watchCounts = parseWatchCounts(s.watchCounts);
  const videoTags: Record<string, VideoTagging> = {};
  if (s.videoTags && typeof s.videoTags === "object") {
    for (const [id, tagging] of Object.entries(s.videoTags as Record<string, unknown>)) {
      const parsed = parseTagging(tagging);
      if (parsed) videoTags[id] = parsed;
    }
  }
  const unplayableIds = Array.isArray(s.unplayableIds)
    ? s.unplayableIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    videos,
    playlists,
    activePlaylistId: typeof s.activePlaylistId === "string" ? s.activePlaylistId : null,
    watchCounts,
    playMode: isPlayMode(s.playMode) ? s.playMode : "sequential",
    currentVideoId: typeof s.currentVideoId === "string" ? s.currentVideoId : null,
    unplayableIds,
    autoplayNext: s.autoplayNext === false ? false : true,
    starterVersion: typeof s.starterVersion === "number" && Number.isFinite(s.starterVersion) ? s.starterVersion : 0,
    videoTags,
  };
}

export function playlistItemCount(state: AppState): number {
  return state.playlists.reduce((sum, playlist) => sum + playlist.videoIds.length, 0);
}

export function richness(state: AppState): number {
  return Object.keys(state.videos).length * 1000 + playlistItemCount(state) * 10 + state.playlists.length;
}

export function isStarterShaped(state: AppState): boolean {
  const ids = Object.keys(state.videos);
  return ids.length <= STARTER_VIDEOS.length && ids.every((id) => STARTER_IDS.has(id));
}

export function mergeStates(base: AppState, incoming: AppState): AppState {
  const videos = { ...base.videos, ...incoming.videos };
  const playlistsById = new Map<string, Playlist>();
  for (const playlist of [...base.playlists, ...incoming.playlists]) {
    const existing = playlistsById.get(playlist.id);
    if (!existing) {
      playlistsById.set(playlist.id, { ...playlist, videoIds: uniqueIds(playlist.videoIds) });
      continue;
    }
    playlistsById.set(playlist.id, {
      ...existing,
      name: playlist.name || existing.name,
      videoIds: uniqueIds([...existing.videoIds, ...playlist.videoIds]),
    });
  }
  const watchCounts = { ...base.watchCounts };
  for (const [id, count] of Object.entries(incoming.watchCounts)) {
    watchCounts[id] = Math.max(watchCounts[id] ?? 0, count);
  }
  const videoTags = { ...base.videoTags };
  for (const [id, tagging] of Object.entries(incoming.videoTags)) {
    const current = videoTags[id];
    if (!current || tagging.source === "manual" || current.source !== "manual") videoTags[id] = tagging;
  }
  return {
    videos,
    playlists: [...playlistsById.values()],
    activePlaylistId: incoming.activePlaylistId ?? base.activePlaylistId,
    watchCounts,
    playMode: incoming.playMode ?? base.playMode,
    currentVideoId: incoming.currentVideoId ?? base.currentVideoId,
    unplayableIds: uniqueIds([...base.unplayableIds, ...incoming.unplayableIds]),
    autoplayNext: incoming.autoplayNext,
    starterVersion: Math.max(base.starterVersion, incoming.starterVersion),
    videoTags,
  };
}

function withPlaylist(state: AppState): AppState {
  if (state.playlists.length === 0) {
    const fresh = emptyState();
    return {
      ...state,
      playlists: fresh.playlists,
      activePlaylistId: fresh.activePlaylistId,
    };
  }
  if (!state.activePlaylistId || !state.playlists.some((p) => p.id === state.activePlaylistId)) {
    return { ...state, activePlaylistId: state.playlists[0]?.id ?? null };
  }
  return state;
}

function withAutoTags(state: AppState): AppState {
  try {
    return { ...state, videoTags: applyAutoTags(state.videos, state.videoTags) };
  } catch {
    return state;
  }
}

export function hydrateState(parsed: AppState): AppState {
  return withAutoTags(applyStarterIfNeeded(stripUnplayableFromPlaylists(withPlaylist(parsed))));
}

function shouldProtectExisting(existing: AppState, next: AppState): boolean {
  return richness(existing) > richness(next) && isStarterShaped(next) && !isStarterShaped(existing);
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

function saveState(state: AppState): void {
  const primaryRaw = safeGet(STORAGE_KEY);
  const existing = parseRaw(primaryRaw);

  if (primaryRaw && !existing && isStarterShaped(state)) {
    safeSet(BACKUP_KEY, primaryRaw);
    return;
  }

  if (existing && shouldProtectExisting(existing, state)) {
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

export const localStore: Store & {
  parse: typeof parseState;
  merge: typeof mergeStates;
  exportJson: typeof exportJson;
  richness: typeof richness;
  isStarterShaped: typeof isStarterShaped;
  takeRestoredNotice: typeof takeRestoredNotice;
  loadDurableBackup: typeof loadDurableBackup;
} = {
  load: loadFromStorage,
  save: saveState,
  parse: parseState,
  merge: mergeStates,
  exportJson,
  richness,
  isStarterShaped,
  takeRestoredNotice,
  loadDurableBackup,
};
