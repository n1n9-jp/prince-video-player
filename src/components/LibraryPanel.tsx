import type { Video } from "../storage/types";
import { VideoCard } from "./VideoCard";

type Props = {
  videos: Video[];
  playlistIds: Set<string>;
  unplayableIds: string[];
  watchCounts: Record<string, number>;
  onPlay: (video: Video) => void;
  onAddToPlaylist: (videoId: string) => void;
  onRemoveFromLibrary: (videoId: string) => void;
};

export function LibraryPanel({
  videos,
  playlistIds,
  unplayableIds,
  watchCounts,
  onPlay,
  onAddToPlaylist,
  onRemoveFromLibrary,
}: Props) {
  const blocked = new Set(unplayableIds);
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>ライブラリ</h2>
        <p>{videos.length} 本</p>
      </header>
      {videos.length === 0 ? (
        <p className="empty">検索、動画ID、またはチャンネルから入れると、ここに並びます。</p>
      ) : (
        <div className="video-grid">
          {videos.map((video) => {
            const inPlaylist = playlistIds.has(video.id);
            const unplayable = blocked.has(video.id);
            const count = watchCounts[video.id] ?? 0;
            return (
              <VideoCard
                key={video.id}
                video={video}
                meta={unplayable ? "埋込不可" : count > 0 ? `視聴 ${count} 回` : undefined}
                onOpen={() => {
                  if (!unplayable) onPlay(video);
                }}
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
