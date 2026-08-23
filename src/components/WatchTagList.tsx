import { useMemo } from "react";
import { catalogIndex } from "../catalog";
import type { Concert, Song, VideoTagging } from "../catalog/types";
import { concertLabel, kindClass, kindLabel } from "./TagRow";

type Props = {
  videoIds: string[];
  videoTags: Record<string, VideoTagging>;
  currentTagging?: VideoTagging;
};

type Chip = {
  id: string;
  label: string;
  kind: string;
  title: string;
  scope: "concert" | "song";
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
      scope: "song",
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
    scope: "concert" as const,
  }));
  if (live.length > 0) groups.push({ title: "公演", chips: live.sort(byLabel) });
  if (official.length > 0) groups.push({ title: "公式", chips: official.sort(byLabel) });
  if (unreleased.length > 0) groups.push({ title: "未発表", chips: unreleased.sort(byLabel) });
  if (covers.length > 0) groups.push({ title: "カバー", chips: covers.sort(byLabel) });
  return groups;
}

function isNow(chip: Chip, current?: VideoTagging): boolean {
  if (!current) return false;
  if (chip.scope === "concert") return current.concertId === chip.id;
  return current.songIds.includes(chip.id);
}

export function WatchTagList({ videoIds, videoTags, currentTagging }: Props) {
  const groups = useMemo(() => collect(videoIds, videoTags), [videoIds, videoTags]);
  if (groups.length === 0) return null;

  return (
    <section className="watch-tags" aria-label="このリストのタグ">
      <p className="watch-tags-kicker">このリスト</p>
      {groups.map((group) => (
        <div key={group.title} className="watch-tags-line">
          <span className="watch-tags-label">{group.title}</span>
          <div className="tag-row">
            {group.chips.map((chip) => {
              const now = isNow(chip, currentTagging);
              return (
                <span
                  key={chip.id}
                  className={`tag-chip ${chip.kind}${now ? " now" : ""}`}
                  title={now ? `再生中 · ${chip.title}` : chip.title}
                  aria-current={now ? "true" : undefined}
                >
                  {chip.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
