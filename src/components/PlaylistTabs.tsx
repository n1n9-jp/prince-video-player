import type { Playlist } from "../storage/types";

type Props = {
  playlists: Playlist[];
  activePlaylistId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onMove: (direction: -1 | 1) => void;
};

export function PlaylistTabs({ playlists, activePlaylistId, onSelect, onCreate, onMove }: Props) {
  const index = playlists.findIndex((playlist) => playlist.id === activePlaylistId);
  const canMove = playlists.length > 1 && index >= 0;

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
      <button type="button" className="chip" onClick={onCreate}>
        ＋
      </button>
      {canMove ? (
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
