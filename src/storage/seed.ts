import type { AppState, Video } from "./types";

function thumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

export const STARTER_VIDEOS: Video[] = [
  {
    id: "Zi9nlmMA12Y",
    title: "I Wanna Be Your Lover — Prince | The Midnight Special",
    channelTitle: "The Midnight Special",
    thumbnailUrl: thumb("Zi9nlmMA12Y"),
  },
  {
    id: "6SFNW5F8K9Y",
    title: "While My Guitar Gently Weeps — Prince, Tom Petty & more | Rock Hall 2004",
    channelTitle: "Rock & Roll Hall of Fame",
    thumbnailUrl: thumb("6SFNW5F8K9Y"),
  },
  {
    id: "NFXZNt4oLkE",
    title: "Creep — Prince at Coachella 2008",
    channelTitle: "Miles Vincent Hartl",
    thumbnailUrl: thumb("NFXZNt4oLkE"),
  },
  {
    id: "4fPKcqx87Yc",
    title: "Prince — Live in Syracuse 1985",
    channelTitle: "Prince Live Content Channel Remastered",
    thumbnailUrl: thumb("4fPKcqx87Yc"),
  },
  {
    id: "3ZGpnga25n8",
    title: "Little Red Corvette — Welcome 2 America, LA Forum 2011",
    channelTitle: "Stuart Studios",
    thumbnailUrl: thumb("3ZGpnga25n8"),
  },
];

export const STARTER_VERSION = 1;

export function withStarterVideos(state: AppState): AppState {
  const videos = { ...state.videos };
  for (const video of STARTER_VIDEOS) {
    videos[video.id] = videos[video.id] ?? video;
  }
  const seedIds = STARTER_VIDEOS.map((video) => video.id);
  const unplayableIds = state.unplayableIds.filter((id) => !seedIds.includes(id));
  const targetId = state.activePlaylistId ?? state.playlists[0]?.id ?? null;
  const playlists = state.playlists.map((playlist) => {
    if (playlist.id !== targetId) return playlist;
    const existing = new Set(playlist.videoIds);
    const added = seedIds.filter((id) => !existing.has(id));
    return { ...playlist, videoIds: [...added, ...playlist.videoIds] };
  });
  return {
    ...state,
    videos,
    playlists,
    unplayableIds,
    currentVideoId: state.currentVideoId ?? seedIds[0] ?? null,
    starterVersion: STARTER_VERSION,
  };
}

export function applyStarterIfNeeded(state: AppState): AppState {
  if (state.starterVersion >= STARTER_VERSION) return state;
  return withStarterVideos(state);
}
