import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import { catalogIndex } from "../catalog";
import type { Song, VideoTagging } from "../catalog/types";
import type { Video } from "../storage/types";
import { kindClass, kindLabel } from "./TagRow";

export type YearBar = {
  year: number;
  count: number;
};

export type PlayableSong = {
  song: Song;
  year: number;
  videoIds: string[];
};

export type YearIndex = {
  bars: YearBar[];
  songsByYear: Map<number, PlayableSong[]>;
};

type Props = {
  videos: Record<string, Video>;
  videoTags: Record<string, VideoTagging>;
  currentVideoId: string | null;
  onPlay: (videoId: string) => void;
};

export function songYear(song: Song): number | undefined {
  if (song.year != null) return song.year;
  if (!song.firstReleaseId) return undefined;
  const release = catalogIndex.releasesById.get(song.firstReleaseId);
  const y = release?.date ? Number(release.date.slice(0, 4)) : Number.NaN;
  return Number.isFinite(y) ? y : undefined;
}

export function buildYearIndex(videos: Record<string, Video>, videoTags: Record<string, VideoTagging>): YearIndex {
  const videoIdsBySong = new Map<string, string[]>();
  for (const [videoId, tagging] of Object.entries(videoTags)) {
    if (!videos[videoId]) continue;
    for (const songId of tagging.songIds) {
      const list = videoIdsBySong.get(songId);
      if (list) list.push(videoId);
      else videoIdsBySong.set(songId, [videoId]);
    }
  }

  const songsByYear = new Map<number, PlayableSong[]>();
  for (const [songId, videoIds] of videoIdsBySong) {
    const song = catalogIndex.songsById.get(songId);
    if (!song) continue;
    const year = songYear(song);
    if (year == null) continue;
    const entry: PlayableSong = { song, year, videoIds };
    const list = songsByYear.get(year);
    if (list) list.push(entry);
    else songsByYear.set(year, [entry]);
  }

  for (const list of songsByYear.values()) {
    list.sort((a, b) => a.song.title.localeCompare(b.song.title, "ja"));
  }

  const bars = [...songsByYear.entries()]
    .map(([year, songs]) => ({ year, count: songs.length }))
    .sort((a, b) => a.year - b.year);

  return { bars, songsByYear };
}

function token(node: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(node).getPropertyValue(name).trim();
  return value || fallback;
}

function YearBars({
  rows,
  selectedYear,
  onSelectYear,
}: {
  rows: YearBar[];
  selectedYear: number | null;
  onSelectYear: (year: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectYearRef = useRef(onSelectYear);
  onSelectYearRef.current = onSelectYear;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    let plot: ReturnType<typeof Plot.plot> | undefined;
    let focused: YearBar | null = null;

    function draw() {
      const node = containerRef.current;
      if (!node) return;
      plot?.remove();
      plot = undefined;
      const width = node.clientWidth;
      if (width < 40 || rows.length === 0) return;

      const gold = token(node, "--gold", "oklch(79% 0.11 86)");
      const plum = token(node, "--plum", "oklch(36% 0.11 318)");
      const ink = token(node, "--ink", "oklch(95% 0.025 92)");
      const line = token(node, "--line", "oklch(32% 0.06 318)");
      const raised = token(node, "--raised", "oklch(20% 0.065 318)");
      const years = rows.map((row) => row.year);
      const labeled = new Set(years.filter((year) => year % 5 === 0));
      const first = years[0];
      const last = years[years.length - 1];
      if (first != null) labeled.add(first);
      if (last != null) labeled.add(last);

      plot = Plot.plot({
        width,
        height: 176,
        marginTop: 10,
        marginRight: 8,
        marginBottom: 36,
        marginLeft: 28,
        style: {
          background: "transparent",
          color: ink,
          fontSize: "10px",
          overflow: "visible",
        },
        x: {
          type: "band",
          label: null,
          tickRotate: -45,
          tickSize: 3,
          tickFormat: (year: number) => (labeled.has(year) ? String(year) : ""),
        },
        y: {
          label: null,
          grid: true,
          tickSize: 0,
          ticks: 4,
        },
        marks: [
          Plot.ruleY([0], { stroke: line }),
          Plot.barY(rows, {
            x: "year",
            y: "count",
            fill: (d: YearBar) => (d.year === selectedYear ? gold : plum),
            rx: 1,
            insetLeft: 0.5,
            insetRight: 0.5,
          }),
          Plot.tip(
            rows,
            Plot.pointerX({
              x: "year",
              y: "count",
              title: (d: YearBar) => `${d.year} · ${d.count}曲`,
              fill: raised,
              stroke: line,
            }),
          ),
        ],
      });

      plot.addEventListener("input", () => {
        const value = plot?.value as YearBar | null | undefined;
        focused = value && typeof value.year === "number" ? value : null;
      });
      plot.addEventListener("click", () => {
        const value = (plot?.value as YearBar | null | undefined) ?? focused;
        if (value && typeof value.year === "number") onSelectYearRef.current(value.year);
      });
      node.append(plot);
    }

    draw();
    const observer = new ResizeObserver(() => draw());
    observer.observe(root);
    return () => {
      observer.disconnect();
      plot?.remove();
    };
  }, [rows, selectedYear]);

  return <div ref={containerRef} className="year-explore-plot" role="img" aria-label="発表年ごとの再生可能曲数" />;
}

export function YearExplore({ videos, videoTags, currentVideoId, onPlay }: Props) {
  const index = useMemo(() => buildYearIndex(videos, videoTags), [videos, videoTags]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  const yearSongs = selectedYear == null ? [] : (index.songsByYear.get(selectedYear) ?? []);
  const selectedSong = yearSongs.find((entry) => entry.song.id === selectedSongId);
  const selectedVideos = (selectedSong?.videoIds ?? [])
    .map((id) => videos[id])
    .filter((video): video is Video => Boolean(video));

  if (index.bars.length === 0) return null;

  function selectYear(year: number) {
    setSelectedYear(year);
    setSelectedSongId(null);
  }

  function selectSong(entry: PlayableSong) {
    setSelectedSongId(entry.song.id);
    if (entry.videoIds.length === 1) {
      const id = entry.videoIds[0];
      if (id) onPlay(id);
    }
  }

  return (
    <section className="year-explore" aria-label="年で探す">
      <p className="year-explore-kicker">年で探す</p>
      <YearBars rows={index.bars} selectedYear={selectedYear} onSelectYear={selectYear} />
      {selectedYear != null ? (
        <div className="year-explore-year">
          <p className="year-explore-caption">
            {selectedYear} · {yearSongs.length}曲
          </p>
          <div className="year-explore-songs">
            {yearSongs.map((entry) => {
              const playing = entry.videoIds.includes(currentVideoId ?? "");
              const on = entry.song.id === selectedSongId;
              return (
                <button
                  key={entry.song.id}
                  type="button"
                  className={`tag-chip ${kindClass(entry.song.kind)}${on || playing ? " now" : ""}`}
                  title={kindLabel(entry.song.kind)}
                  aria-pressed={on}
                  onClick={() => selectSong(entry)}
                >
                  {entry.song.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {selectedSong && selectedVideos.length > 1 ? (
        <ul className="year-explore-videos">
          {selectedVideos.map((video) => {
            const now = video.id === currentVideoId;
            return (
              <li key={video.id}>
                <button type="button" className={now ? "now" : undefined} onClick={() => onPlay(video.id)}>
                  {video.title}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
