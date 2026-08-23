import type { FormEvent } from "react";
import type { PlayMode, Playlist, Video } from "../storage/types";
import { ModeToggle } from "./ModeToggle";
import { PlaylistTabs } from "./PlaylistTabs";

type Props = {
  playlists: Playlist[];
  activePlaylistId: string | null;
  videos: Record<string, Video>;
  watchCounts: Record<string, number>;
  currentVideoId: string | null;
  autoplayNext: boolean;
  playMode: PlayMode;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist: () => void;
  onMovePlaylist: (direction: -1 | 1) => void;
  onRenamePlaylist: (name: string) => void;
  onDeletePlaylist: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (videoId: string) => void;
  onPlay: (videoId: string) => void;
  onAutoplayNextChange: (value: boolean) => void;
  onPlayModeChange: (mode: PlayMode) => void;
};

export function PlaylistPanel({
  playlists,
  activePlaylistId,
  videos,
  watchCounts,
  currentVideoId,
  autoplayNext,
  playMode,
  onSelectPlaylist,
  onCreatePlaylist,
  onMovePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onMove,
  onRemove,
  onPlay,
  onAutoplayNextChange,
  onPlayModeChange,
}: Props) {
  const active = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const total = active?.videoIds.length ?? 0;
  const position = currentVideoId && active ? active.videoIds.indexOf(currentVideoId) + 1 : 0;

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("name");
    if (!(input instanceof HTMLInputElement)) return;
    onRenamePlaylist(input.value);
  }

  return (
    <section className="playlist-dock">
      <header className="playlist-dock-head">
        <div>
          <h2>{active?.name ?? "プレイリスト"}</h2>
          <p>
            {total === 0 ? "0 本" : `${Math.max(position, 1)} / ${total} 本`}
          </p>
          <ModeToggle value={playMode} onChange={onPlayModeChange} />
        </div>
        <button
          type="button"
          className={autoplayNext ? "switch on" : "switch"}
          role="switch"
          aria-checked={autoplayNext}
          onClick={() => onAutoplayNextChange(!autoplayNext)}
        >
          <span className="switch-track" aria-hidden="true">
            <span className="switch-knob" />
          </span>
          連続再生
        </button>
      </header>
      <PlaylistTabs
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        onSelect={onSelectPlaylist}
        onCreate={onCreatePlaylist}
        onMove={onMovePlaylist}
      />
      {active && (
        <form className="row-form quiet" onSubmit={handleRename}>
          <input name="name" defaultValue={active.name} key={active.id} aria-label="プレイリスト名" />
          <button type="submit" className="btn-text">
            改名
          </button>
          <button type="button" className="btn-text" onClick={onDeletePlaylist}>
            削除
          </button>
        </form>
      )}
      {!active || active.videoIds.length === 0 ? (
        <p className="empty">追加ページのライブラリから「リストへ」を押すと、ここに並びます。</p>
      ) : (
        <ol className="queue">
          {active.videoIds.map((id, index) => {
            const video = videos[id];
            if (!video) return null;
            const count = watchCounts[id] ?? 0;
            return (
              <li key={id} className={id === currentVideoId ? "current" : undefined}>
                <button type="button" className="queue-main" onClick={() => onPlay(id)}>
                  <span className="idx">{index + 1}</span>
                  <img src={video.thumbnailUrl} alt="" />
                  <span className="queue-copy">
                    <strong>{video.title}</strong>
                    <span>
                      {video.channelTitle}
                      {count > 0 ? ` · 視聴 ${count}` : ""}
                    </span>
                  </span>
                </button>
                <div className="queue-actions">
                  <button type="button" className="btn-text" onClick={() => onMove(index, -1)} disabled={index === 0}>
                    上へ
                  </button>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => onMove(index, 1)}
                    disabled={index === active.videoIds.length - 1}
                  >
                    下へ
                  </button>
                  <button type="button" className="btn-text" onClick={() => onRemove(id)}>
                    削除
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
