import { catalogIndex, type CatalogIndex } from "./index";
import { foldTitle } from "./normalize";
import type { MatchConfidence, VideoTagging } from "./types";

function findNeedleIndex(haystack: string, needle: string): number {
  if (!needle) return -1;
  if (haystack === needle) return 0;
  if (haystack.startsWith(`${needle} `)) return 0;
  if (haystack.endsWith(` ${needle}`)) return haystack.length - needle.length;
  const inner = ` ${needle} `;
  const at = haystack.indexOf(inner);
  return at >= 0 ? at + 1 : -1;
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function tagTitle(title: string, index: CatalogIndex = catalogIndex): VideoTagging | null {
  const haystack = foldTitle(title);
  if (!haystack) return null;

  const songIds: string[] = [];
  const occupied = new Set<number>();

  for (const needle of index.songNeedles) {
    const start = findNeedleIndex(haystack, needle.needle);
    if (start < 0) continue;
    const end = start + needle.needle.length;
    let overlaps = false;
    for (let i = start; i < end; i += 1) {
      if (occupied.has(i)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    for (let i = start; i < end; i += 1) occupied.add(i);
    if (!songIds.includes(needle.songId)) songIds.push(needle.songId);
  }

  let concertId: string | undefined;
  let concertNeedle = "";
  for (const needle of index.concertNeedles) {
    if (concertNeedle && needle.needle.length < concertNeedle.length) break;
    if (findNeedleIndex(haystack, needle.needle) < 0) continue;
    concertId = needle.concertId;
    concertNeedle = needle.needle;
    break;
  }

  const filteredSongs = concertNeedle
    ? songIds.filter((id) => {
        const song = index.songsById.get(id);
        if (!song) return true;
        const folded = foldTitle(song.title);
        if (folded.length >= 8 && concertNeedle.includes(folded)) {
          const concertAt = findNeedleIndex(haystack, concertNeedle);
          const songAt = findNeedleIndex(haystack, folded);
          return songAt >= 0 && concertAt >= 0 && (songAt < concertAt || songAt >= concertAt + concertNeedle.length);
        }
        return true;
      })
    : songIds;

  if (filteredSongs.length === 0 && !concertId) return null;

  if (filteredSongs.length === 0 && concertId) {
    const concert = index.concertsById.get(concertId);
    const setlistIds = concert?.setlist.map((item) => item.songId) ?? [];
    return {
      songIds: unique(setlistIds),
      releaseIds: unique(
        setlistIds
          .map((id) => index.songsById.get(id)?.firstReleaseId)
          .filter((id): id is string => Boolean(id)),
      ),
      concertId,
      source: "auto",
      confidence: "medium",
    };
  }

  const releaseIds = unique(
    filteredSongs
      .map((id) => index.songsById.get(id)?.firstReleaseId)
      .filter((id): id is string => Boolean(id)),
  );

  const confidence: MatchConfidence = "high";
  return {
    songIds: filteredSongs,
    releaseIds,
    concertId,
    source: "auto",
    confidence,
  };
}

export function tagVideoTitle(title: string): VideoTagging | null {
  return tagTitle(title);
}
