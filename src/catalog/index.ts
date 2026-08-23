import concertsData from "./data/concerts.json";
import releasesData from "./data/releases.json";
import songsData from "./data/songs.json";
import { expandFolded, foldTitle, isStrictNeedle } from "./normalize";
import type { Catalog, Concert, Release, Song } from "./types";

export type SongNeedle = {
  songId: string;
  needle: string;
  strict: boolean;
};

export type ConcertNeedle = {
  concertId: string;
  needle: string;
};

export type CatalogIndex = {
  catalog: Catalog;
  songsById: Map<string, Song>;
  releasesById: Map<string, Release>;
  concertsById: Map<string, Concert>;
  songNeedles: SongNeedle[];
  concertNeedles: ConcertNeedle[];
};

function asSongs(value: unknown): Song[] {
  return Array.isArray(value) ? (value as Song[]) : [];
}

function asReleases(value: unknown): Release[] {
  return Array.isArray(value) ? (value as Release[]) : [];
}

function asConcerts(value: unknown): Concert[] {
  return Array.isArray(value) ? (value as Concert[]) : [];
}

export function buildIndex(catalog: Catalog): CatalogIndex {
  const songsById = new Map(catalog.songs.map((song) => [song.id, song]));
  const releasesById = new Map(catalog.releases.map((release) => [release.id, release]));
  const concertsById = new Map(catalog.concerts.map((concert) => [concert.id, concert]));

  const songNeedles: SongNeedle[] = [];
  for (const song of catalog.songs) {
    if (song.confidence === "low") continue;
    const labels = [song.title, ...song.aliases];
    const seen = new Set<string>();
    for (const label of labels) {
      const folded = foldTitle(label);
      for (const variant of expandFolded(folded)) {
        if (!variant || seen.has(variant)) continue;
        if (/^(or|no|it|now|a|i|to|u)$/.test(variant)) continue;
        seen.add(variant);
        songNeedles.push({
          songId: song.id,
          needle: variant,
          strict: isStrictNeedle(variant),
        });
      }
    }
  }
  songNeedles.sort((a, b) => b.needle.length - a.needle.length);

  const concertNeedles: ConcertNeedle[] = [];
  for (const concert of catalog.concerts) {
    const labels = [
      concert.venue,
      `${concert.venue} ${concert.date.slice(0, 4)}`,
      ...concert.aliases,
      concert.tour ? `${concert.tour} ${concert.date.slice(0, 4)}` : "",
    ];
    const seen = new Set<string>();
    for (const label of labels) {
      const folded = foldTitle(label);
      for (const variant of expandFolded(folded)) {
        if (!variant || seen.has(variant)) continue;
        seen.add(variant);
        concertNeedles.push({ concertId: concert.id, needle: variant });
      }
    }
  }
  concertNeedles.sort((a, b) => b.needle.length - a.needle.length);

  return { catalog, songsById, releasesById, concertsById, songNeedles, concertNeedles };
}

export const catalog: Catalog = {
  songs: asSongs(songsData),
  releases: asReleases(releasesData),
  concerts: asConcerts(concertsData),
};

export const catalogIndex = buildIndex(catalog);
