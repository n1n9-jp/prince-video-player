import { catalogIndex } from "../catalog";
import { foldTitle } from "../catalog/normalize";
import type { VideoTagging } from "../catalog/types";
import type { Video } from "../storage/types";

export type KindFilter = "all" | "official" | "live" | "unreleased" | "cover";

export function matchesKindFilter(tagging: VideoTagging | undefined, kind: KindFilter): boolean {
  if (kind === "all") return true;
  if (!tagging) return false;
  if (kind === "live") return Boolean(tagging.concertId);
  return tagging.songIds.some((id) => {
    const song = catalogIndex.songsById.get(id);
    if (!song) return false;
    if (kind === "unreleased") return song.kind === "unreleased";
    if (kind === "cover") return song.kind === "cover";
    return song.kind === "official" || song.kind === "laterReleased";
  });
}

export function matchesLibraryQuery(video: Video, tagging: VideoTagging | undefined, query: string): boolean {
  if (!query) return true;
  const hay = foldTitle(
    [
      video.title,
      ...(tagging?.songIds ?? []).map((id) => catalogIndex.songsById.get(id)?.title ?? ""),
      tagging?.concertId ? (catalogIndex.concertsById.get(tagging.concertId)?.aliases.join(" ") ?? "") : "",
    ].join(" "),
  );
  return hay.includes(query);
}

export function visibleLibraryVideos(
  videos: Video[],
  options: {
    videoTags: Record<string, VideoTagging>;
    unplayableIds: Iterable<string>;
    playlistIds: Iterable<string>;
    kind: KindFilter;
    query: string;
    hideUnplayable: boolean;
    hideInPlaylist: boolean;
  },
): Video[] {
  const blocked = new Set(options.unplayableIds);
  const inPlaylist = new Set(options.playlistIds);
  const query = foldTitle(options.query);
  return videos.filter((video) => {
    if (options.hideUnplayable && blocked.has(video.id)) return false;
    if (options.hideInPlaylist && inPlaylist.has(video.id)) return false;
    const tagging = options.videoTags[video.id];
    return matchesKindFilter(tagging, options.kind) && matchesLibraryQuery(video, tagging, query);
  });
}
