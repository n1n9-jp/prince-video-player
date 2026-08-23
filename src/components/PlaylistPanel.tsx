import type { FormEvent } from "react";
import type { PlayMode, Playlist, Video } from "../storage/types";
import { ModeToggle } from "./ModeToggle";
import { PlaylistTabs } from "./PlaylistTabs";

type Props = {
  variant: "watch" | "edit";
  playlists: Playlist[];
  activePlaylistId: string | null;
  videos: Record<string, Video>;
  watchCounts: Record<string, number>;
  currentVideoId: string | null;
  autoplayNext?: boolean;
  playMode?: PlayMode;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist?: () => void;
  onMovePlaylist?: (direction: -1 | 1) => void;
  onRenamePlaylist?: (name: string) => void;
  onDeletePlaylist?: () => void;
  onMove?: (index: number, direction: -1 | 1) => void;
  onRemove?: (videoId: string) => void;
  onPlay: (videoId: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onAutoplayNextChange?: (value: boolean) => void;
  onPlayModeChange?: (mode: PlayMode) => void;
};

export function PlaylistPanel({
  variant,
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
  onPrev,
  onNext,
  onAutoplayNextChange,
  onPlayModeChange,
}: Props) {
  const editable = variant === "edit";
  const active = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const total = active?.videoIds.length ?? 0;
  const position = currentVideoId && active ? active.videoIds.indexOf(currentVideoId) + 1 : 0;

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("name");
    if (!(input instanceof HTMLInputElement) || !onRenamePlaylist) return;
    onRenamePlaylist(input.value);
  }

  return (
    <section className={editable ? "playlist-dock playlist-editor" : "playlist-dock"}>
      <header className="playlist-dock-head">
        <div>
          <h2>{active?.name ?? "プレイリスト"}</h2>
          <p>{total === 0 ? "0 本" : `${Math.max(position, 1)} / ${total} 本`}</p>
        </div>
        {!editable ? (
          <div className="playlist-dock-tools">
            {onAutoplayNextChange ? (
              <button
                type="button"
                className={autoplayNext ? "switch on" : "switch"}
                role="switch"
                aria-checked={Boolean(autoplayNext)}
                onClick={() => onAutoplayNextChange(!autoplayNext)}
              >
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-knob" />
                </span>
                連続再生
              </button>
            ) : null}
            {onPrev && onNext ? (
              <div className="playlist-skip">
                <button type="button" className="btn-ghost" onClick={onPrev} disabled={!currentVideoId}>
                  前へ
                </button>
                <button type="button" className="btn-ghost" onClick={onNext} disabled={!currentVideoId}>
                  次へ
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      <PlaylistTabs
        playlists={playlists}
        activePlaylistId={activePlaylistId}
        onSelect={onSelectPlaylist}
        onCreate={onCreatePlaylist}
        onMove={onMovePlaylist}
        editable={editable}
      />
      {!editable && playMode && onPlayModeChange ? (
        <ModeToggle value={playMode} onChange={onPlayModeChange} />
      ) : null}
      {editable && active && onRenamePlaylist && onDeletePlaylist ? (
        <form className="row-form quiet" onSubmit={handleRename}>
          <input name="name" defaultValue={active.name} key={active.id} aria-label="プレイリスト名" />
          <button type="submit" className="btn-text">
            改名
          </button>
          <button type="button" className="btn-text" onClick={onDeletePlaylist}>
            削除
          </button>
        </form>
      ) : null}
      {!active || active.videoIds.length === 0 ? (
        <p className="empty">
          {editable
            ? "ライブラリから「リストへ」を押すと、このプレイリストに入ります。"
            : "編集ページでリストに入れると、ここで再生できます。"}
        </p>
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
                {editable && onMove && onRemove ? (
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
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
