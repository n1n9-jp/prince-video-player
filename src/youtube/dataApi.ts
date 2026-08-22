import type { Video } from "../storage/types";
import { keepCueable } from "./iframePlayer";

const SEARCH_CACHE_KEY = "prince-video-player:search:v4";
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

type SearchCache = Record<string, Video[]>;

function apiKey(): string {
  return import.meta.env.VITE_YOUTUBE_API_KEY?.trim() ?? "";
}

export function hasApiKey(): boolean {
  return apiKey().length > 0;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (url.hostname.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && VIDEO_ID_RE.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && parts[1] && VIDEO_ID_RE.test(parts[1])) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

type ChannelRef = { type: "id" | "handle" | "username"; value: string };

export function parseChannelRef(input: string): ChannelRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (CHANNEL_ID_RE.test(trimmed)) return { type: "id", value: trimmed };
  if (trimmed.startsWith("@") && trimmed.length > 1) return { type: "handle", value: trimmed };
  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith("youtube.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "channel" && parts[1] && CHANNEL_ID_RE.test(parts[1])) {
      return { type: "id", value: parts[1] };
    }
    if (parts[0]?.startsWith("@") && parts[0].length > 1) {
      return { type: "handle", value: parts[0] };
    }
    if (parts[0] === "user" && parts[1]) return { type: "username", value: parts[1] };
    if ((parts[0] === "c" || parts[0] === "handle") && parts[1]) {
      return { type: "handle", value: parts[1].startsWith("@") ? parts[1] : `@${parts[1]}` };
    }
  } catch {
    return null;
  }
  return null;
}

function loadCache(): SearchCache {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SearchCache;
  } catch {
    return {};
  }
}

function saveCache(cache: SearchCache): void {
  localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
}

function cacheKey(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

type SearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
};

function videoFromSearchItem(item: SearchItem): Video | null {
  const id = item.id?.videoId;
  if (!id) return null;
  return {
    id,
    title: item.snippet?.title ?? id,
    channelTitle: item.snippet?.channelTitle ?? "",
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? thumbnailUrl(id),
  };
}

function looksUnembeddable(video: Video): boolean {
  const title = video.title;
  const channel = video.channelTitle.trim().toLowerCase();
  if (/\bOfficial\s+(Music\s+)?Video\b/i.test(title)) return true;
  if (/\bVEVO\b/i.test(title) || channel.endsWith("vevo")) return true;
  if (channel === "prince" || channel.endsWith(" - topic")) return true;
  return false;
}

function mergeVideos(lists: Video[][]): Video[] {
  const seen = new Set<string>();
  const merged: Video[] = [];
  for (const list of lists) {
    for (const video of list) {
      if (seen.has(video.id)) continue;
      seen.add(video.id);
      merged.push(video);
    }
  }
  return merged;
}

type SearchPage = {
  videos: Video[];
  nextPageToken?: string;
};

async function searchPage(query: string, pageToken?: string): Promise<SearchPage> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "50",
    q: query,
    key: apiKey(),
  });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  const body = (await res.json()) as {
    error?: { message?: string };
    items?: SearchItem[];
    nextPageToken?: string;
  };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `検索に失敗しました（${res.status}）`);
  }
  return {
    videos: (body.items ?? []).map(videoFromSearchItem).filter((v): v is Video => v !== null),
    nextPageToken: body.nextPageToken,
  };
}

async function ingest(raw: Video[], seen: Set<string>): Promise<Video[]> {
  const fresh = raw.filter((video) => !looksUnembeddable(video) && !seen.has(video.id));
  for (const video of fresh) seen.add(video.id);
  return keepCueable(await keepEmbeddable(fresh));
}

async function collectPlayable(query: string): Promise<Video[]> {
  const seen = new Set<string>();
  const first = await searchPage(query);
  let videos = await ingest(first.videos, seen);
  if (videos.length < 12 && first.nextPageToken) {
    const second = await searchPage(query, first.nextPageToken);
    videos = mergeVideos([videos, await ingest(second.videos, seen)]);
  }
  const liveQuery = `${query} live`;
  if (videos.length < 12 && cacheKey(liveQuery) !== cacheKey(query)) {
    const live = await searchPage(liveQuery);
    videos = mergeVideos([videos, await ingest(live.videos, seen)]);
  }
  return videos;
}

export async function searchVideos(query: string, unplayableIds: string[] = []): Promise<Video[]> {
  const key = cacheKey(query);
  if (!key) return [];
  const cache = loadCache();
  const cached = cache[key];
  const blocked = new Set(unplayableIds);
  if (cached) return cached.filter((video) => !blocked.has(video.id));
  if (!hasApiKey()) {
    throw new Error("APIキーがありません。.env.local に VITE_YOUTUBE_API_KEY を設定してください。");
  }

  const videos = await collectPlayable(query.trim());
  cache[key] = videos;
  saveCache(cache);
  return videos.filter((video) => !blocked.has(video.id));
}

type StatusItem = {
  id?: string;
  status?: { embeddable?: boolean };
};

async function keepEmbeddable(videos: Video[]): Promise<Video[]> {
  if (!hasApiKey() || videos.length === 0) return videos;
  const kept: Video[] = [];
  for (let i = 0; i < videos.length; i += 50) {
    const group = videos.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "status",
      id: group.map((video) => video.id).join(","),
      key: apiKey(),
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
    const body = (await res.json()) as { items?: StatusItem[] };
    if (!res.ok) {
      kept.push(...group);
      continue;
    }
    const allowed = new Set(
      (body.items ?? []).filter((item) => item.id && item.status?.embeddable).map((item) => item.id as string),
    );
    kept.push(...group.filter((video) => allowed.has(video.id)));
  }
  return kept;
}

type VideosListItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
};

export async function fetchVideoById(videoId: string): Promise<Video> {
  const fallback: Video = {
    id: videoId,
    title: videoId,
    channelTitle: "",
    thumbnailUrl: thumbnailUrl(videoId),
  };
  if (!hasApiKey()) return fallback;

  const params = new URLSearchParams({
    part: "snippet,status",
    id: videoId,
    key: apiKey(),
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);
  const body = (await res.json()) as { items?: (VideosListItem & { status?: { embeddable?: boolean } })[] };
  const item = body.items?.[0];
  if (!item?.id) return fallback;
  if (item.status && item.status.embeddable === false) {
    throw new Error("この動画は YouTube 側で埋め込み再生が禁止されています。");
  }
  return {
    id: item.id,
    title: item.snippet?.title ?? item.id,
    channelTitle: item.snippet?.channelTitle ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? thumbnailUrl(item.id),
  };
}

type ChannelListItem = {
  snippet?: { title?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

async function resolveUploads(ref: ChannelRef): Promise<{ title: string; uploadsId: string }> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    key: apiKey(),
  });
  if (ref.type === "id") params.set("id", ref.value);
  if (ref.type === "handle") params.set("forHandle", ref.value);
  if (ref.type === "username") params.set("forUsername", ref.value);

  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`);
  const body = (await res.json()) as { error?: { message?: string }; items?: ChannelListItem[] };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `チャンネルの取得に失敗しました（${res.status}）`);
  }
  const channel = body.items?.[0];
  const uploadsId = channel?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) {
    throw new Error("チャンネルが見つかりません。URL・@handle・チャンネルIDを確認してください。");
  }
  return { title: channel?.snippet?.title ?? "チャンネル", uploadsId };
}

type PlaylistItem = {
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    resourceId?: { kind?: string; videoId?: string };
  };
};

function videoFromPlaylistItem(item: PlaylistItem): Video | null {
  const id = item.snippet?.resourceId?.videoId;
  const title = item.snippet?.title ?? "";
  if (!id) return null;
  if (/^(Private|Deleted) video$/i.test(title)) return null;
  return {
    id,
    title: title || id,
    channelTitle: item.snippet?.channelTitle ?? "",
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? thumbnailUrl(id),
  };
}

async function listUploads(uploadsId: string): Promise<Video[]> {
  const videos: Video[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({
      part: "snippet",
      playlistId: uploadsId,
      maxResults: "50",
      key: apiKey(),
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`);
    const body = (await res.json()) as {
      error?: { message?: string };
      items?: PlaylistItem[];
      nextPageToken?: string;
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? `チャンネルの動画一覧の取得に失敗しました（${res.status}）`);
    }
    for (const item of body.items ?? []) {
      const video = videoFromPlaylistItem(item);
      if (video) videos.push(video);
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return videos;
}

export async function fetchChannelUploads(
  input: string,
  unplayableIds: string[] = [],
): Promise<{ title: string; videos: Video[] }> {
  const ref = parseChannelRef(input);
  if (!ref) {
    throw new Error("チャンネルの URL、@handle、またはチャンネルIDを入力してください。");
  }
  if (!hasApiKey()) {
    throw new Error("APIキーがありません。.env.local に VITE_YOUTUBE_API_KEY を設定してください。");
  }
  const { title, uploadsId } = await resolveUploads(ref);
  const blocked = new Set(unplayableIds);
  const videos = (await keepEmbeddable(await listUploads(uploadsId))).filter((video) => !blocked.has(video.id));
  return { title, videos };
}
