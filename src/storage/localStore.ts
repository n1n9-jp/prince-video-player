import { applyStarterIfNeeded } from "./seed";
import { emptyState, stripUnplayableFromPlaylists, type AppState, type PlayMode, type Playlist, type Store, type Video } from "./types";

const KEY = "prince-video-player";

function isPlayMode(value: unknown): value is PlayMode {
  return value === "sequential" || value === "shuffle" || value === "leastPlayed";
}

function isVideo(value: unknown): value is Video {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.channelTitle === "string" &&
    typeof v.thumbnailUrl === "string"
  );
}

function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    Array.isArray(p.videoIds) &&
    p.videoIds.every((id) => typeof id === "string")
  );
}

function parseState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!s.videos || typeof s.videos !== "object") return null;
  const videos: Record<string, Video> = {};
  for (const [id, video] of Object.entries(s.videos as Record<string, unknown>)) {
    if (!isVideo(video) || video.id !== id) return null;
    videos[id] = video;
  }
  if (!Array.isArray(s.playlists) || !s.playlists.every(isPlaylist)) return null;
  if (s.activePlaylistId !== null && typeof s.activePlaylistId !== "string") return null;
  if (!s.watchCounts || typeof s.watchCounts !== "object") return null;
  const watchCounts: Record<string, number> = {};
  for (const [id, count] of Object.entries(s.watchCounts as Record<string, unknown>)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return null;
    watchCounts[id] = count;
  }
  if (!isPlayMode(s.playMode)) return null;
  if (s.currentVideoId !== null && typeof s.currentVideoId !== "string") return null;
  const unplayableIds =
    Array.isArray(s.unplayableIds) && s.unplayableIds.every((id) => typeof id === "string") ? s.unplayableIds : [];
  const autoplayNext = s.autoplayNext === false ? false : true;
  const starterVersion = typeof s.starterVersion === "number" && Number.isFinite(s.starterVersion) ? s.starterVersion : 0;
  return {
    videos,
    playlists: s.playlists,
    activePlaylistId: s.activePlaylistId,
    watchCounts,
    playMode: s.playMode,
    currentVideoId: s.currentVideoId,
    unplayableIds,
    autoplayNext,
    starterVersion,
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

export const localStore: Store = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return applyStarterIfNeeded(emptyState());
      const parsed = parseState(JSON.parse(raw) as unknown);
      if (!parsed) return applyStarterIfNeeded(emptyState());
      return applyStarterIfNeeded(stripUnplayableFromPlaylists(withPlaylist(parsed)));
    } catch {
      return applyStarterIfNeeded(emptyState());
    }
  },
  save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  },
};
