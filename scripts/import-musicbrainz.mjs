import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UA = "PrinceLounge/1.0.0 ( https://github.com/n1n9-jp/prince-video-player )";
const ARTIST_MBID = "070d193a-845c-479f-980e-bef15710653e";
const SKIP_SECONDARY = new Set([
  "Live",
  "Remix",
  "Demo",
  "Mixtape/Street",
  "Interview",
  "Spokenword",
  "Audiobook",
  "DJ-mix",
  "Broadcast",
]);
const SKIP_TITLES = /^(intro|outro|applause|interview|dialogue|announcement|silence|untitled|data track)$/i;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, "scripts", ".cache");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function foldTitle(input) {
  return String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/☮/g, "o")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(title) {
  return foldTitle(title).replace(/ /g, "-");
}

function cleanTrackTitle(title) {
  return title
    .replace(
      /\s*[\[(][^)\]]*\b(live|remix|mix|edit|version|instrumental|mono|stereo|remaster(?:ed)?|album version|single version|extended|demo)\b[^)\]]*[)\]]/gi,
      "",
    )
    .replace(/\s*-\s*(live|remix|remastered).*$/i, "")
    .trim();
}

async function mb(searchParams) {
  const url = `https://musicbrainz.org/ws/2/release?${searchParams.toString()}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(1100);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (res.status === 503 || res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MusicBrainz ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error(`MusicBrainz retries exhausted: ${url}`);
}

async function fetchAll(type) {
  const releases = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const params = new URLSearchParams({
      artist: ARTIST_MBID,
      status: "official",
      type,
      inc: "recordings+release-groups+media",
      limit: "100",
      offset: String(offset),
      fmt: "json",
    });
    const body = await mb(params);
    total = body["release-count"] ?? 0;
    const batch = body.releases ?? [];
    releases.push(...batch);
    offset += 100;
    console.log(`  ${type}: ${Math.min(offset, total)}/${total}`);
    if (batch.length === 0) break;
  }
  return releases;
}

function releaseType(rg) {
  const primary = rg?.["primary-type"];
  const secondary = rg?.["secondary-types"] ?? [];
  if (secondary.some((value) => SKIP_SECONDARY.has(value))) return null;
  if (secondary.includes("Compilation")) return "compilation";
  if (secondary.includes("Soundtrack")) return "soundtrack";
  if (primary === "Album") return "album";
  if (primary === "Single") return "single";
  if (primary === "EP") return "ep";
  return null;
}

function trackCount(release) {
  return (release.media ?? []).reduce((sum, media) => sum + (media.tracks?.length ?? media["track-count"] ?? 0), 0);
}

function scoreRelease(release, firstDate) {
  let score = 0;
  const country = release.country ?? "";
  if (country === "US") score += 30;
  else if (country === "XW" || country === "XE") score += 20;
  else if (country === "GB") score += 12;
  const date = release.date ?? "";
  if (firstDate && date && date.slice(0, 4) === firstDate.slice(0, 4)) score += 16;
  if (firstDate && date === firstDate) score += 10;
  const blob = `${release.title} ${release.disambiguation ?? ""}`.toLowerCase();
  if (/deluxe|expanded|anniversary|super deluxe|remaster|hi.?res/.test(blob)) score -= 40;
  const discs = release.media?.length ?? 0;
  if (discs > 2) score -= 6;
  score += Math.min(trackCount(release), 18) * 0.25;
  if (date) score += (9999 - Number(date.slice(0, 4) || 9999)) * 0.01;
  return score;
}

function pickCanonical(group) {
  const firstDate = group[0]?.["release-group"]?.["first-release-date"] ?? "";
  return group
    .slice()
    .sort((a, b) => {
      const diff = scoreRelease(b, firstDate) - scoreRelease(a, firstDate);
      if (diff !== 0) return diff;
      return (a.date ?? "9999").localeCompare(b.date ?? "9999");
    })[0];
}

function uniqueSlug(base, used) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const id = `${base}-${n}`;
  used.add(id);
  return id;
}

function collectTracks(release) {
  const tracks = [];
  let position = 1;
  for (const media of release.media ?? []) {
    for (const track of media.tracks ?? []) {
      const raw = track.title || track.recording?.title || "";
      const title = cleanTrackTitle(raw);
      if (!title || SKIP_TITLES.test(title) || SKIP_TITLES.test(foldTitle(title))) continue;
      tracks.push({ title, position });
      position += 1;
    }
  }
  return tracks;
}

function buildCatalog(allReleases) {
  const byGroup = new Map();
  for (const release of allReleases) {
    const rg = release["release-group"];
    if (!rg?.id) continue;
    const type = releaseType(rg);
    if (!type) continue;
    const list = byGroup.get(rg.id) ?? [];
    list.push(release);
    byGroup.set(rg.id, list);
  }

  const usedReleaseIds = new Set();
  const songsByFold = new Map();
  const releases = [];

  for (const group of byGroup.values()) {
    const chosen = pickCanonical(group);
    const rg = chosen["release-group"];
    const type = releaseType(rg);
    if (!chosen || !type) continue;
    const tracks = collectTracks(chosen);
    if (tracks.length === 0) continue;
    const releaseId = uniqueSlug(slugify(rg.title || chosen.title), usedReleaseIds);
    const date = chosen.date || rg["first-release-date"] || undefined;
    const year = date ? Number(date.slice(0, 4)) : undefined;
    const mapped = [];
    for (const track of tracks) {
      const folded = foldTitle(track.title);
      if (!folded) continue;
      let song = songsByFold.get(folded);
      if (!song) {
        song = {
          id: slugify(track.title),
          title: track.title,
          aliases: [],
          kind: "official",
          confidence: "high",
          sourceUrl: `https://musicbrainz.org/release/${chosen.id}`,
          appearances: [],
        };
        songsByFold.set(folded, song);
      }
      song.appearances.push({ releaseId, type, date, year });
      mapped.push({ songId: song.id, position: track.position });
    }
    releases.push({
      id: releaseId,
      title: rg.title || chosen.title,
      type,
      date,
      tracks: mapped,
      mbid: chosen.id,
    });
  }

  const rank = { album: 0, soundtrack: 1, ep: 2, single: 3, compilation: 4 };
  const songs = [];
  const usedSongIds = new Set();
  for (const song of songsByFold.values()) {
    const appearances = song.appearances.slice().sort((a, b) => {
      const typeDiff = (rank[a.type] ?? 9) - (rank[b.type] ?? 9);
      if (typeDiff !== 0) return typeDiff;
      return (a.date ?? "9999").localeCompare(b.date ?? "9999");
    });
    const first = appearances[0];
    const id = uniqueSlug(song.id, usedSongIds);
    songs.push({
      id,
      title: song.title,
      aliases: song.aliases,
      kind: "official",
      firstReleaseId: first?.releaseId,
      year: first?.year,
      sourceUrl: song.sourceUrl,
      confidence: "high",
    });
    if (id !== song.id) {
      for (const release of releases) {
        for (const track of release.tracks) {
          if (track.songId === song.id) track.songId = id;
        }
      }
    }
  }

  songs.sort((a, b) => a.title.localeCompare(b.title));
  releases.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.title.localeCompare(b.title));
  return { songs, releases };
}

async function main() {
  await mkdir(cacheDir, { recursive: true });
  const rawPath = path.join(cacheDir, "musicbrainz-releases.json");
  let all;
  try {
    all = JSON.parse(await (await import("node:fs/promises")).readFile(rawPath, "utf8"));
    if (!Array.isArray(all) || all.length < 100) throw new Error("cache incomplete");
    console.log(`Using cached ${all.length} releases`);
  } catch {
    console.log("Fetching MusicBrainz official releases…");
    const albums = await fetchAll("album");
    const singles = await fetchAll("single");
    const eps = await fetchAll("ep");
    all = [...albums, ...singles, ...eps];
    await writeFile(rawPath, JSON.stringify(all));
    console.log(`Cached ${all.length} releases`);
  }
  const catalog = buildCatalog(all);
  await writeFile(path.join(cacheDir, "mb-songs.json"), JSON.stringify(catalog.songs, null, 2));
  await writeFile(path.join(cacheDir, "mb-releases.json"), JSON.stringify(catalog.releases, null, 2));
  console.log(`MusicBrainz songs=${catalog.songs.length} releases=${catalog.releases.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
