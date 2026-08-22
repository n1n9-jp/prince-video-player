import type { FormEvent } from "react";
import type { Playlist, Video } from "../storage/types";

type Props = {
  playlists: Playlist[];
  activePlaylistId: string | null;
  videos: Record<string, Video>;
  watchCounts: Record<string, number>;
  currentVideoId: string | null;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist: () => void;
  onRenamePlaylist: (name: string) => void;
  onDeletePlaylist: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (videoId: string) => void;
  onPlay: (videoId: string) => void;
};

export function PlaylistPanel({
  playlists,
  activePlaylistId,
  videos,
  watchCounts,
  currentVideoId,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onMove,
  onRemove,
  onPlay,
}: Props) {
  const active = playlists.find((p) => p.id === activePlaylistId) ?? null;

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("name");
    if (!(input instanceof HTMLInputElement)) return;
    onRenamePlaylist(input.value);
  }

  return (
    <section className="panel playlist-panel">
      <header className="panel-head">
        <h2>プレイリスト</h2>
        <button type="button" className="btn-text" onClick={onCreatePlaylist}>
          新規
        </button>
      </header>
      <div className="playlist-switch">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            className={playlist.id === activePlaylistId ? "chip on" : "chip"}
            onClick={() => onSelectPlaylist(playlist.id)}
          >
            {playlist.name}
          </button>
        ))}
      </div>
      {active && (
        <form className="row-form quiet" onSubmit={handleRename}>
          <input name="name" defaultValue={active.name} key={active.id} aria-label="プレイリスト名" />
          <button type="submit" className="btn-ghost">
            改名
          </button>
          <button type="button" className="btn-text" onClick={onDeletePlaylist}>
            削除
          </button>
        </form>
      )}
      {!active || active.videoIds.length === 0 ? (
        <p className="empty">ライブラリから曲を足すと、ここで順番を組めます。</p>
      ) : (
        <ol className="queue">
          {active.videoIds.map((id, index) => {
            const video = videos[id];
            if (!video) return null;
            const count = watchCounts[id] ?? 0;
            return (
              <li key={id} className={id === currentVideoId ? "current" : undefined}>
                <button type="button" className="queue-main" onClick={() => onPlay(id)}>
                  <span className="idx">{String(index + 1).padStart(2, "0")}</span>
                  <span className="queue-copy">
                    <strong>{video.title}</strong>
                    <span>{video.channelTitle}{count > 0 ? ` · 視聴 ${count}` : " · 未視聴"}</span>
                  </span>
                </button>
                <div className="queue-actions">
                  <button type="button" className="btn-text" onClick={() => onMove(index, -1)} disabled={index === 0}>
                    上
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => onMove(index, 1)}
                    disabled={index === active.videoIds.length - 1}
                  >
                    下
                  </button>
                  <button type="button" className="btn-text" onClick={() => onRemove(id)}>
                    外す
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
