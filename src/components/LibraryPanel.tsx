import { useMemo, useState } from "react";
import { catalogIndex } from "../catalog";
import type { VideoTagging } from "../catalog/types";
import { visibleLibraryVideos, type KindFilter } from "../library/visible";
import type { Playlist, Video } from "../storage/types";
import { VideoCard } from "./VideoCard";

type Props = {
  videos: Video[];
  playlists: Playlist[];
  targetPlaylistId: string | null;
  unplayableIds: string[];
  watchCounts: Record<string, number>;
  videoTags: Record<string, VideoTagging>;
  onPlay: (video: Video) => void;
  onTargetPlaylist: (playlistId: string) => void;
  onAddToPlaylist: (videoId: string, playlistId: string) => void;
  onRemoveFromLibrary: (videoId: string) => void;
  onAddSongTag: (videoId: string, songId: string) => void;
  onRemoveSongTag: (videoId: string, songId: string) => void;
};

export function LibraryPanel({
  videos,
  playlists,
  targetPlaylistId,
  unplayableIds,
  watchCounts,
  videoTags,
  onPlay,
  onTargetPlaylist,
  onAddToPlaylist,
  onRemoveFromLibrary,
  onAddSongTag,
  onRemoveSongTag,
}: Props) {
  const blocked = new Set(unplayableIds);
  const target = playlists.find((playlist) => playlist.id === targetPlaylistId) ?? playlists[0] ?? null;
  const targetIds = target?.videoIds ?? [];
  const playlistIds = new Set(targetIds);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [hideUnplayable, setHideUnplayable] = useState(true);
  const [hideInPlaylist, setHideInPlaylist] = useState(true);

  const visible = useMemo(
    () =>
      visibleLibraryVideos(videos, {
        videoTags,
        unplayableIds,
        playlistIds,
        kind,
        query,
        hideUnplayable,
        hideInPlaylist,
      }),
    [videos, videoTags, unplayableIds, targetIds, kind, query, hideUnplayable, hideInPlaylist],
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
        <label className="library-target">
          <span>追加先</span>
          <select
            value={target?.id ?? ""}
            disabled={playlists.length === 0}
            aria-label="追加先プレイリスト"
            onChange={(event) => onTargetPlaylist(event.target.value)}
          >
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
        </label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="曲名・公演で絞る"
          aria-label="ライブラリ内の曲名検索"
        />
        <select value={kind} onChange={(event) => setKind(event.target.value as KindFilter)} aria-label="タグ種別">
          <option value="all">すべて</option>
          <option value="official">公式</option>
          <option value="live">ライブ</option>
          <option value="unreleased">未発表</option>
          <option value="cover">カバー</option>
        </select>
      </div>
      <div className="library-filters">
        <button
          type="button"
          className={hideUnplayable ? "chip on" : "chip"}
          aria-pressed={hideUnplayable}
          onClick={() => setHideUnplayable((value) => !value)}
        >
          埋込不能を隠す
        </button>
        <button
          type="button"
          className={hideInPlaylist ? "chip on" : "chip"}
          aria-pressed={hideInPlaylist}
          onClick={() => setHideInPlaylist((value) => !value)}
        >
          リスト済を隠す
        </button>
      </div>
      <datalist id="catalog-songs">
        {catalogIndex.catalog.songs.map((song) => (
          <option key={song.id} value={song.title} />
        ))}
      </datalist>
      {videos.length === 0 ? (
        <p className="empty">検索、動画ID、またはチャンネルから入れると、ここに並びます。</p>
      ) : visible.length === 0 ? (
        <p className="empty">条件に合う動画がありません。フィルタを外すと埋込不能やリスト済も表示します。</p>
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
                meta={unplayable ? "埋込不能" : count > 0 ? `視聴 ${count} 回` : undefined}
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
                      disabled={inPlaylist || unplayable || !target}
                      onClick={() => {
                        if (target) onAddToPlaylist(video.id, target.id);
                      }}
                    >
                      {unplayable ? "埋込不能" : inPlaylist ? "リスト済" : `${target?.name ?? "リスト"}へ`}
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
