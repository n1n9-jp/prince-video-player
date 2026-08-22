import type { Video } from "../storage/types";

type Props = {
  videos: Video[];
  playlistIds: Set<string>;
  unplayableIds: string[];
  onAddToPlaylist: (videoId: string) => void;
  onRemoveFromLibrary: (videoId: string) => void;
};

export function LibraryPanel({ videos, playlistIds, unplayableIds, onAddToPlaylist, onRemoveFromLibrary }: Props) {
  const blocked = new Set(unplayableIds);
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>ライブラリ</h2>
        <p>{videos.length} 本</p>
      </header>
      {videos.length === 0 ? (
        <p className="empty">検索結果やチャンネルから入れると、ここに溜まります。</p>
      ) : (
        <ul className="video-list">
          {videos.map((video) => {
            const inPlaylist = playlistIds.has(video.id);
            const unplayable = blocked.has(video.id);
            return (
              <li key={video.id}>
                <img src={video.thumbnailUrl} alt="" />
                <div>
                  <strong>{video.title}</strong>
                  <span>{video.channelTitle}</span>
                </div>
                <div className="btn-stack">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={inPlaylist || unplayable}
                    onClick={() => onAddToPlaylist(video.id)}
                  >
                    {unplayable ? "埋込不可" : inPlaylist ? "リスト済" : "リストへ"}
                  </button>
                  <button type="button" className="btn-text" onClick={() => onRemoveFromLibrary(video.id)}>
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
