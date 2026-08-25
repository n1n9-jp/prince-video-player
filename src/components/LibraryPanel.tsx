import { useMemo, useState } from "react";
import { catalogIndex } from "../catalog";
import { foldTitle } from "../catalog/normalize";
import type { VideoTagging } from "../catalog/types";
import type { Video } from "../storage/types";
import { VideoCard } from "./VideoCard";

type KindFilter = "all" | "official" | "live" | "unreleased" | "cover";

type Props = {
  videos: Video[];
  playlistIds: Set<string>;
  unplayableIds: string[];
  watchCounts: Record<string, number>;
  videoTags: Record<string, VideoTagging>;
  onPlay: (video: Video) => void;
  onAddToPlaylist: (videoId: string) => void;
  onRemoveFromLibrary: (videoId: string) => void;
  onAddSongTag: (videoId: string, songId: string) => void;
  onRemoveSongTag: (videoId: string, songId: string) => void;
};

function matchesFilter(tagging: VideoTagging | undefined, kind: KindFilter): boolean {
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

function matchesQuery(video: Video, tagging: VideoTagging | undefined, raw: string): boolean {
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const fields = [
    video.title,
    video.channelTitle,
    video.id,
    ...(tagging?.songIds ?? []).map((id) => catalogIndex.songsById.get(id)?.title ?? ""),
    tagging?.concertId ? catalogIndex.concertsById.get(tagging.concertId)?.aliases.join(" ") ?? "" : "",
  ].join(" ");
  const hay = fields.toLowerCase();
  const foldedHay = foldTitle(fields);
  return tokens.every((token) => {
    if (hay.includes(token)) return true;
    const folded = foldTitle(token);
    return folded.length > 0 && foldedHay.includes(folded);
  });
}

export function LibraryPanel({
  videos,
  playlistIds,
  unplayableIds,
  watchCounts,
  videoTags,
  onPlay,
  onAddToPlaylist,
  onRemoveFromLibrary,
  onAddSongTag,
  onRemoveSongTag,
}: Props) {
  const blocked = new Set(unplayableIds);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [showListed, setShowListed] = useState(true);
  const [showUnplayable, setShowUnplayable] = useState(true);

  const visible = useMemo(
    () =>
      videos.filter((video) => {
        const tagging = videoTags[video.id];
        const listed = playlistIds.has(video.id);
        const unplayable = blocked.has(video.id);
        if (!showListed && listed) return false;
        if (!showUnplayable && unplayable) return false;
        return matchesFilter(tagging, kind) && matchesQuery(video, tagging, query);
      }),
    [videos, videoTags, kind, query, playlistIds, blocked, showListed, showUnplayable],
  );

  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>ライブラリ</h2>
        <p>
          {visible.length}
          {visible.length !== videos.length ? ` / ${videos.length}` : ""} 本
        </p>
      </header>
      <div className="library-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="タイトル、チャンネル、ID、曲名"
          aria-label="ライブラリ内を探す"
        />
        <select value={kind} onChange={(event) => setKind(event.target.value as KindFilter)} aria-label="タグ種別">
          <option value="all">すべて</option>
          <option value="official">公式</option>
          <option value="live">ライブ</option>
          <option value="unreleased">未発表</option>
          <option value="cover">カバー</option>
        </select>
        <button
          type="button"
          className={showListed ? "chip on" : "chip"}
          aria-pressed={showListed}
          onClick={() => setShowListed((value) => !value)}
        >
          リスト済
        </button>
        <button
          type="button"
          className={showUnplayable ? "chip on" : "chip"}
          aria-pressed={showUnplayable}
          onClick={() => setShowUnplayable((value) => !value)}
        >
          埋込不可
        </button>
      </div>
      {videos.length === 0 ? (
        <p className="empty">検索、動画ID、またはチャンネルから入れると、ここに並びます。</p>
      ) : visible.length === 0 ? (
        <p className="empty">条件に合う動画がありません。</p>
      ) : (
        <div className="video-grid">
          {visible.map((video) => {
            const inPlaylist = playlistIds.has(video.id);
            const unplayable = blocked.has(video.id);
            const count = watchCounts[video.id] ?? 0;
            return (
              <VideoCard
                key={video.id}
                video={video}
                tagging={videoTags[video.id]}
                editableTags
                meta={unplayable ? "埋込不可" : count > 0 ? `視聴 ${count} 回` : undefined}
                onOpen={() => {
                  if (!unplayable) onPlay(video);
                }}
                onAddSong={(songId) => onAddSongTag(video.id, songId)}
                onRemoveSong={(songId) => onRemoveSongTag(video.id, songId)}
                actions={
                  <>
                    <button
                      type="button"
                      className="btn-text"
                      disabled={inPlaylist || unplayable}
                      onClick={() => onAddToPlaylist(video.id)}
                    >
                      {unplayable ? "埋込不可" : inPlaylist ? "リスト済" : "リストへ"}
                    </button>
                    <button type="button" className="btn-text" onClick={() => onRemoveFromLibrary(video.id)}>
                      削除
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
