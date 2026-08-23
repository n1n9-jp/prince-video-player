import { tagTitle } from "./match";
import type { VideoTagging } from "./types";
import type { Video } from "../storage/types";

export function applyAutoTags(
  videos: Record<string, Video>,
  existing: Record<string, VideoTagging> = {},
): Record<string, VideoTagging> {
  const next: Record<string, VideoTagging> = {};
  for (const video of Object.values(videos)) {
    const current = existing[video.id];
    if (current?.source === "manual") {
      next[video.id] = current;
      continue;
    }
    const tagged = tagTitle(video.title);
    if (tagged) next[video.id] = tagged;
  }
  return next;
}

export function withManualSongs(tagging: VideoTagging | undefined, songIds: string[]): VideoTagging {
  return {
    songIds,
    releaseIds: tagging?.releaseIds ?? [],
    concertId: tagging?.concertId,
    source: "manual",
    confidence: "high",
  };
}

export function addManualSong(tagging: VideoTagging | undefined, songId: string): VideoTagging {
  const songIds = tagging?.songIds.includes(songId) ? tagging.songIds : [...(tagging?.songIds ?? []), songId];
  return withManualSongs(tagging, songIds);
}

export function removeManualSong(tagging: VideoTagging | undefined, songId: string): VideoTagging | undefined {
  const songIds = (tagging?.songIds ?? []).filter((id) => id !== songId);
  if (songIds.length === 0 && !tagging?.concertId) return undefined;
  return withManualSongs(tagging, songIds);
}
