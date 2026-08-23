import { useMemo } from "react";
import { catalogIndex } from "../catalog";
import type { Concert, Song, VideoTagging } from "../catalog/types";
import { concertLabel, kindClass, kindLabel } from "./TagRow";

type Props = {
  videoIds: string[];
  videoTags: Record<string, VideoTagging>;
};

type Chip = {
  id: string;
  label: string;
  kind: string;
  title: string;
};

type Group = {
  title: string;
  chips: Chip[];
};

function byLabel(a: Chip, b: Chip): number {
  return a.label.localeCompare(b.label, "ja");
}

function collect(videoIds: string[], videoTags: Record<string, VideoTagging>): Group[] {
  const concerts = new Map<string, Concert>();
  const songs = new Map<string, Song>();
  for (const videoId of videoIds) {
    const tagging = videoTags[videoId];
    if (!tagging) continue;
    if (tagging.concertId) {
      const concert = catalogIndex.concertsById.get(tagging.concertId);
      if (concert) concerts.set(concert.id, concert);
    }
    for (const songId of tagging.songIds) {
      const song = catalogIndex.songsById.get(songId);
      if (song) songs.set(song.id, song);
    }
  }

  const official: Chip[] = [];
  const unreleased: Chip[] = [];
  const covers: Chip[] = [];
  for (const song of songs.values()) {
    const chip: Chip = {
      id: song.id,
      label: song.title,
      kind: kindClass(song.kind),
      title: kindLabel(song.kind),
    };
    if (song.kind === "unreleased") unreleased.push(chip);
    else if (song.kind === "cover") covers.push(chip);
    else official.push(chip);
  }

  const groups: Group[] = [];
  const live = [...concerts.values()].map((concert) => ({
    id: concert.id,
    label: concertLabel(concert),
    kind: "live",
    title: "ライブ",
  }));
  if (live.length > 0) groups.push({ title: "公演", chips: live.sort(byLabel) });
  if (official.length > 0) groups.push({ title: "公式", chips: official.sort(byLabel) });
  if (unreleased.length > 0) groups.push({ title: "未発表", chips: unreleased.sort(byLabel) });
  if (covers.length > 0) groups.push({ title: "カバー", chips: covers.sort(byLabel) });
  return groups;
}

export function WatchTagList({ videoIds, videoTags }: Props) {
  const groups = useMemo(() => collect(videoIds, videoTags), [videoIds, videoTags]);
  if (groups.length === 0) return null;

  return (
    <section className="watch-tags" aria-label="タグ">
      <h2>タグ</h2>
      {groups.map((group) => (
        <div key={group.title} className="watch-tags-group">
          <h3>{group.title}</h3>
          <div className="tag-row">
            {group.chips.map((chip) => (
              <span key={chip.id} className={`tag-chip ${chip.kind}`} title={chip.title}>
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
