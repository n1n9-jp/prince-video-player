import { useEffect, useMemo, useRef, useState } from "react";
import * as Plot from "@observablehq/plot";
import { catalogIndex } from "../catalog";
import type { Song, VideoTagging } from "../catalog/types";
import type { Playlist, Video } from "../storage/types";
import { PlaylistCard, playlistCoverUrl } from "./PlaylistCard";
import { kindClass, kindLabel } from "./TagRow";
import { VideoCard } from "./VideoCard";

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
  unplayableIds: string[];
  watchCounts: Record<string, number>;
  savedPlaylists: Playlist[];
  activePlaylistId: string | null;
  onPlay: (video: Video) => void;
  onOpenYearPlaylist: (year: number, videoIds: string[]) => void;
  onOpenSavedPlaylist: (id: string) => void;
  onYearQueue?: (queue: { year: number; videoIds: string[] } | null) => void;
  onSelectYear?: () => void;
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

export function pickRandomSelection(index: YearIndex): { year: number; songId: string } | null {
  if (index.bars.length === 0) return null;
  const bar = index.bars[Math.floor(Math.random() * index.bars.length)];
  if (!bar) return null;
  const songs = index.songsByYear.get(bar.year) ?? [];
  if (songs.length === 0) return null;
  const entry = songs[Math.floor(Math.random() * songs.length)];
  if (!entry) return null;
  return { year: bar.year, songId: entry.song.id };
}

export function videosForYear(index: YearIndex, year: number): string[] {
  const songs = index.songsByYear.get(year) ?? [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of songs) {
    for (const id of entry.videoIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function yearPlaylistId(year: number): string {
  return `year-${year}`;
}

export function parseYearPlaylistId(id: string): number | null {
  const match = /^year-(\d+)$/.exec(id);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

export function yearPlaylists(
  index: YearIndex,
  videos: Record<string, Video>,
  unplayableIds: string[],
): Playlist[] {
  const blocked = new Set(unplayableIds);
  const lists: Playlist[] = [];
  for (let i = index.bars.length - 1; i >= 0; i--) {
    const bar = index.bars[i];
    if (!bar) continue;
    const videoIds = videosForYear(index, bar.year).filter((id) => videos[id] && !blocked.has(id));
    if (videoIds.length === 0) continue;
    lists.push({ id: yearPlaylistId(bar.year), name: `${bar.year}年`, videoIds });
  }
  return lists;
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
          cursor: "pointer",
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

export function YearExplore({
  videos,
  videoTags,
  unplayableIds,
  watchCounts,
  savedPlaylists,
  activePlaylistId,
  onPlay,
  onOpenYearPlaylist,
  onOpenSavedPlaylist,
  onYearQueue,
  onSelectYear,
}: Props) {
  const index = useMemo(() => buildYearIndex(videos, videoTags), [videos, videoTags]);
  const blocked = useMemo(() => new Set(unplayableIds), [unplayableIds]);
  const autoPlaylists = useMemo(() => yearPlaylists(index, videos, unplayableIds), [index, videos, unplayableIds]);
  const seeded = useRef(false);
  const onYearQueueRef = useRef(onYearQueue);
  onYearQueueRef.current = onYearQueue;
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  if (!seeded.current && index.bars.length > 0) {
    const pick = pickRandomSelection(index);
    if (pick) {
      seeded.current = true;
      setSelectedYear(pick.year);
      setSelectedSongId(pick.songId);
    }
  }

  const yearSongs = selectedYear == null ? [] : (index.songsByYear.get(selectedYear) ?? []);
  const selectedSong = yearSongs.find((entry) => entry.song.id === selectedSongId);
  const selectedVideos = (selectedSong?.videoIds ?? [])
    .map((id) => videos[id])
    .filter((video): video is Video => Boolean(video));

  useEffect(() => {
    if (selectedYear == null) {
      onYearQueueRef.current?.(null);
      return;
    }
    const videoIds = videosForYear(index, selectedYear).filter((id) => videos[id] && !blocked.has(id));
    onYearQueueRef.current?.({ year: selectedYear, videoIds });
  }, [blocked, index, selectedYear, videos]);

  if (index.bars.length === 0 && savedPlaylists.length === 0) return null;

  function selectYear(year: number) {
    setSelectedYear(year);
    setSelectedSongId(null);
    onSelectYear?.();
  }

  function openYearPlaylist(list: Playlist) {
    const year = parseYearPlaylistId(list.id);
    if (year == null) return;
    if (year !== selectedYear) selectYear(year);
    onOpenYearPlaylist(year, list.videoIds);
  }

  return (
    <section className="year-explore" aria-label="年で探す">
      {index.bars.length > 0 ? (
        <>
          <p className="year-explore-kicker">年で探す</p>
          <YearBars rows={index.bars} selectedYear={selectedYear} onSelectYear={selectYear} />
        </>
      ) : null}
      <div className="browse-playlists">
        <p className="year-explore-kicker">プレイリスト</p>
        <div className="browse-playlists-group">
          <header className="shelf-head">
            <h2>リスト</h2>
            <p>手動 · {savedPlaylists.length}</p>
          </header>
          {savedPlaylists.length === 0 ? (
            <p className="empty">編集ページでリストを作ると、ここに並びます。</p>
          ) : (
            <div className="video-grid">
              {savedPlaylists.map((list) => (
                <PlaylistCard
                  key={list.id}
                  title={list.name}
                  meta={`リスト · ${list.videoIds.length} 本`}
                  thumbnailUrl={playlistCoverUrl(list.videoIds, videos)}
                  active={list.id === activePlaylistId}
                  onOpen={() => onOpenSavedPlaylist(list.id)}
                />
              ))}
            </div>
          )}
        </div>
        {autoPlaylists.length > 0 ? (
          <div className="browse-playlists-group">
            <header className="shelf-head">
              <h2>年</h2>
              <p>自動 · {autoPlaylists.length}</p>
            </header>
            <div className="video-grid">
              {autoPlaylists.map((list) => (
                <PlaylistCard
                  key={list.id}
                  title={list.name}
                  meta={`自動プレイリスト · ${list.videoIds.length} 本`}
                  thumbnailUrl={playlistCoverUrl(list.videoIds, videos)}
                  active={list.id === activePlaylistId}
                  onOpen={() => openYearPlaylist(list)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {index.bars.length > 0 ? (
        selectedYear != null ? (
          <div className="year-explore-year">
            <p className="year-explore-caption">
              {selectedYear} · {yearSongs.length}曲
            </p>
            <div className="year-explore-songs">
              {yearSongs.map((entry) => {
                const on = entry.song.id === selectedSongId;
                return (
                  <button
                    key={entry.song.id}
                    type="button"
                    className={`tag-chip ${kindClass(entry.song.kind)}${on ? " now" : ""}`}
                    title={kindLabel(entry.song.kind)}
                    aria-pressed={on}
                    onClick={() => setSelectedSongId(entry.song.id)}
                  >
                    {entry.song.title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="year-explore-hint">棒をクリックして年を選ぶと、その年の曲が並びます。</p>
        )
      ) : null}
      {selectedSong ? (
        <div className="year-explore-library">
          <header className="shelf-head">
            <h2>{selectedSong.song.title}</h2>
            <p>{selectedVideos.length} 本</p>
          </header>
          {selectedVideos.length === 0 ? (
            <p className="empty">この曲の動画はライブラリにありません。</p>
          ) : (
            <div className="video-grid">
              {selectedVideos.map((video) => {
                const unplayable = blocked.has(video.id);
                const count = watchCounts[video.id] ?? 0;
                return (
                  <VideoCard
                    key={video.id}
                    video={video}
                    tagging={videoTags[video.id]}
                    meta={unplayable ? "埋込不可" : count > 0 ? `視聴 ${count} 回` : undefined}
                    onOpen={() => {
                      if (!unplayable) onPlay(video);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : selectedYear != null ? (
        <p className="year-explore-hint">曲をクリックすると、ライブラリの動画がカードで並びます。</p>
      ) : null}
    </section>
  );
}
