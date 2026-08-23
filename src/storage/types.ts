import type { VideoTagging } from "../catalog/types";

export type PlayMode = "sequential" | "shuffle" | "leastPlayed";

export type Video = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
};

export type { VideoTagging };

export type Playlist = {
  id: string;
  name: string;
  videoIds: string[];
};

export type AppState = {
  videos: Record<string, Video>;
  playlists: Playlist[];
  activePlaylistId: string | null;
  watchCounts: Record<string, number>;
  playMode: PlayMode;
  currentVideoId: string | null;
  unplayableIds: string[];
  autoplayNext: boolean;
  starterVersion: number;
  videoTags: Record<string, VideoTagging>;
};

export type Store = {
  load(): AppState;
  save(state: AppState, options?: { force?: boolean }): void;
};

export function emptyState(): AppState {
  const id = crypto.randomUUID();
  return {
    videos: {},
    playlists: [{ id, name: "Lounge", videoIds: [] }],
    activePlaylistId: id,
    watchCounts: {},
    playMode: "sequential",
    currentVideoId: null,
    unplayableIds: [],
    autoplayNext: true,
    starterVersion: 0,
    videoTags: {},
  };
}

export function activePlaylist(state: AppState): Playlist | null {
  if (!state.activePlaylistId) return null;
  return state.playlists.find((p) => p.id === state.activePlaylistId) ?? null;
}

export function dropFromPlaylists(state: AppState, videoId: string): AppState {
  return {
    ...state,
    unplayableIds: state.unplayableIds.includes(videoId) ? state.unplayableIds : [...state.unplayableIds, videoId],
    playlists: state.playlists.map((playlist) => ({
      ...playlist,
      videoIds: playlist.videoIds.filter((id) => id !== videoId),
    })),
  };
}

export function stripUnplayableFromPlaylists(state: AppState): AppState {
  if (state.unplayableIds.length === 0) return state;
  const blocked = new Set(state.unplayableIds);
  return {
    ...state,
    playlists: state.playlists.map((playlist) => ({
      ...playlist,
      videoIds: playlist.videoIds.filter((id) => !blocked.has(id)),
    })),
    currentVideoId: state.currentVideoId && blocked.has(state.currentVideoId) ? null : state.currentVideoId,
  };
}
