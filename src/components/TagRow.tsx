import type { FormEvent } from "react";
import { catalogIndex } from "../catalog";
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

function AddSongField({ currentIds, onAddSong }: { currentIds: string[]; onAddSong?: (songId: string) => void }) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("song");
    if (!(input instanceof HTMLInputElement)) return;
    const typed = input.value.trim().toLowerCase();
    if (!typed) return;
    const match = catalogIndex.catalog.songs.find(
      (song) =>
        !currentIds.includes(song.id) &&
        (song.id === typed ||
          song.title.toLowerCase() === typed ||
          song.aliases.some((alias) => alias.toLowerCase() === typed)),
    );
    if (match) {
      onAddSong?.(match.id);
      input.value = "";
    }
  }

  return (
    <form className="tag-add" onSubmit={handleSubmit}>
      <input list="catalog-songs" name="song" placeholder="曲を追加" aria-label="曲タグを追加" />
      <button type="submit" className="btn-text">
        追加
      </button>
    </form>
  );
}
