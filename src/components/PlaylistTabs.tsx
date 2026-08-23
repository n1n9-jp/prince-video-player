import type { Playlist } from "../storage/types";

type Props = {
  playlists: Playlist[];
  activePlaylistId: string | null;
  onSelect: (id: string) => void;
  onCreate?: () => void;
  onMove?: (direction: -1 | 1) => void;
  editable?: boolean;
};

export function PlaylistTabs({
  playlists,
  activePlaylistId,
  onSelect,
  onCreate,
  onMove,
  editable = false,
}: Props) {
  const index = playlists.findIndex((playlist) => playlist.id === activePlaylistId);
  const canMove = Boolean(editable && onMove && playlists.length > 1 && index >= 0);

  return (
    <div className="playlist-switch">
      {playlists.map((playlist) => (
        <button
          key={playlist.id}
          type="button"
          className={playlist.id === activePlaylistId ? "chip on" : "chip"}
          onClick={() => onSelect(playlist.id)}
        >
          {playlist.name}
        </button>
      ))}
      {editable && onCreate ? (
        <button type="button" className="chip" onClick={onCreate}>
          ＋
        </button>
      ) : null}
      {canMove && onMove ? (
        <span className="playlist-order">
          <button type="button" className="btn-text" onClick={() => onMove(-1)} disabled={index === 0}>
            左へ
          </button>
          <button
            type="button"
            className="btn-text"
            onClick={() => onMove(1)}
            disabled={index === playlists.length - 1}
          >
            右へ
          </button>
        </span>
      ) : null}
    </div>
  );
}
