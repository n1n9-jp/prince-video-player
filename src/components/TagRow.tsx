import { useMemo, useState, type FormEvent } from "react";
import { catalogIndex } from "../catalog";
import { foldTitle } from "../catalog/normalize";
import type { Concert, Song, SongKind, VideoTagging } from "../catalog/types";

export function concertLabel(concert: Concert): string {
  return concert.aliases[0] ?? `${concert.venue} ${concert.date.slice(0, 4)}`;
}

export function kindLabel(kind: SongKind): string {
  if (kind === "unreleased") return "未発表";
  if (kind === "cover") return "カバー";
  return "公式";
}

export function kindClass(kind: SongKind): string {
  if (kind === "unreleased") return "unreleased";
  if (kind === "cover") return "cover";
  return "official";
}

type Props = {
  tagging?: VideoTagging;
  editable?: boolean;
  compact?: boolean;
  onAddSong?: (songId: string) => void;
  onRemoveSong?: (songId: string) => void;
};

export function TagRow({ tagging, editable, compact, onAddSong, onRemoveSong }: Props) {
  if (!tagging && !editable) return null;
  const concert = tagging?.concertId ? catalogIndex.concertsById.get(tagging.concertId) : undefined;
  const songs = (tagging?.songIds ?? [])
    .map((id) => catalogIndex.songsById.get(id))
    .filter((song): song is Song => Boolean(song));
  const setlistOnly = tagging?.confidence === "medium" && Boolean(concert) && songs.length > 3;
  const limit = compact ? 2 : 6;
  const shown = setlistOnly && !editable ? [] : songs.slice(0, limit);
  const extra = setlistOnly && !editable ? songs.length : Math.max(0, songs.length - shown.length);

  return (
    <div className="tag-row">
      {concert ? <span className="tag-chip live">{concertLabel(concert)}</span> : null}
      {shown.map((song) => (
        <span key={song.id} className={`tag-chip ${kindClass(song.kind)}`} title={kindLabel(song.kind)}>
          {song.title}
          {editable ? (
            <button type="button" className="tag-x" aria-label={`${song.title} を外す`} onClick={() => onRemoveSong?.(song.id)}>
              ×
            </button>
          ) : null}
        </span>
      ))}
      {extra > 0 ? <span className="tag-chip more">{extra} 曲</span> : null}
      {editable ? <AddSongField currentIds={tagging?.songIds ?? []} onAddSong={onAddSong} /> : null}
    </div>
  );
}

function songHaystack(song: Song): string {
  return [song.id, song.title, ...song.aliases].join("\n");
}

function songMatches(song: Song, typed: string): boolean {
  const q = typed.trim().toLowerCase();
  if (!q) return false;
  if (songHaystack(song).toLowerCase().includes(q)) return true;
  const folded = foldTitle(typed);
  return folded.length > 0 && foldTitle(songHaystack(song)).includes(folded);
}

function rankSong(song: Song, typed: string): number {
  const q = typed.trim().toLowerCase();
  const title = song.title.toLowerCase();
  if (title === q || song.id === q) return 0;
  if (title.startsWith(q)) return 1;
  return 2;
}

function pickSong(songs: Song[], typed: string): Song | undefined {
  const q = typed.trim().toLowerCase();
  if (!q) return undefined;
  const exact = songs.find(
    (song) =>
      song.id === q || song.title.toLowerCase() === q || song.aliases.some((alias) => alias.toLowerCase() === q),
  );
  if (exact) return exact;
  return songs.length === 1 ? songs[0] : undefined;
}

function AddSongField({ currentIds, onAddSong }: { currentIds: string[]; onAddSong?: (songId: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    return catalogIndex.catalog.songs
      .filter((song) => !currentIds.includes(song.id) && songMatches(song, query))
      .sort((a, b) => rankSong(a, query) - rankSong(b, query) || a.title.localeCompare(b.title, "ja"));
  }, [query, currentIds]);
  const shown = matches.slice(0, 8);

  function add(songId: string) {
    onAddSong?.(songId);
    setQuery("");
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const song = pickSong(matches, query);
    if (song) add(song.id);
    else setOpen(true);
  }

  return (
    <form className="tag-add" onSubmit={handleSubmit}>
      <div className="tag-add-combo">
        <input
          name="song"
          value={query}
          autoComplete="off"
          spellCheck={false}
          placeholder="曲を追加"
          aria-label="曲タグを追加"
          aria-expanded={open && shown.length > 0}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
        {open && shown.length > 0 ? (
          <ul className="tag-add-menu" role="listbox">
            {shown.map((song) => (
              <li key={song.id}>
                <button
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(song.id)}
                >
                  {song.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="submit" className="btn-text">
        追加
      </button>
    </form>
  );
}
