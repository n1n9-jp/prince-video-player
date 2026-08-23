import type { VideoTagging } from "../catalog/types";
import { STARTER_VIDEOS } from "./seed";
import { emptyState, type AppState, type PlayMode, type Playlist, type Video } from "./types";

const STARTER_IDS = new Set(STARTER_VIDEOS.map((video) => video.id));

export function uniqueIds(ids: string[]): string[] {
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

export function videoCount(state: AppState): number {
  return Object.keys(state.videos).length;
}

export function richness(state: AppState): number {
  return videoCount(state) * 1000 + playlistItemCount(state) * 10 + state.playlists.length;
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

export function withPlaylist(state: AppState): AppState {
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

export function isDangerousReplace(existing: AppState, incoming: AppState): boolean {
  const before = videoCount(existing);
  const after = videoCount(incoming);
  if (before === 0) return false;
  if (isStarterShaped(incoming) && (!isStarterShaped(existing) || before > after)) return true;
  if (before >= 8 && after < Math.ceil(before * 0.5)) return true;
  return false;
}

export function pickCanonical(...states: Array<AppState | null | undefined>): AppState | null {
  const present = states.filter((state): state is AppState => Boolean(state));
  const real = present.filter((state) => !isStarterShaped(state));
  const pool = real.length > 0 ? real : present;
  if (pool.length === 0) return null;
  pool.sort((a, b) => richness(b) - richness(a));
  const [first, ...rest] = pool;
  if (!first) return null;
  return rest.reduce((acc, state) => mergeStates(acc, state), first);
}
