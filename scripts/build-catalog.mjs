import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mergeSong(base, overlay) {
  const aliases = [...new Set([...(base?.aliases ?? []), ...(overlay.aliases ?? [])])];
  return {
    id: overlay.id ?? base?.id,
    title: overlay.title ?? base?.title,
    aliases: aliases.filter((alias) => foldTitle(alias) !== foldTitle(overlay.title ?? base?.title ?? "")),
    kind: overlay.kind ?? base?.kind ?? "official",
    firstReleaseId: overlay.firstReleaseId ?? base?.firstReleaseId,
    year: overlay.year ?? base?.year,
    sourceUrl: overlay.sourceUrl ?? base?.sourceUrl,
    confidence: overlay.confidence ?? base?.confidence ?? "high",
  };
}

function findSongId(songs, title) {
  const folded = foldTitle(title);
  const slug = slugify(title);
  const exact = songs.find((song) => song.id === slug || foldTitle(song.title) === folded);
  if (exact) return exact.id;
  const alias = songs.find(
    (song) =>
      song.aliases.some((value) => foldTitle(value) === folded) ||
      foldTitle(song.title).includes(folded) && folded.length >= 8,
  );
  return alias?.id ?? null;
}

async function main() {
  const cacheDir = path.join(root, "scripts", ".cache");
  const overlayDir = path.join(root, "src", "catalog", "overlays");
  const dataDir = path.join(root, "src", "catalog", "data");

  const mbSongs = await readJson(path.join(cacheDir, "mb-songs.json"), []);
  const mbReleases = await readJson(path.join(cacheDir, "mb-releases.json"), []);
  const extraSongs = await readJson(path.join(overlayDir, "songs.json"), []);
  const aliasMap = await readJson(path.join(overlayDir, "aliases.json"), {});
  const extraReleases = await readJson(path.join(overlayDir, "releases.json"), []);
  const concertDrafts = await readJson(path.join(overlayDir, "concerts.json"), []);

  const byId = new Map();
  for (const song of mbSongs) byId.set(song.id, song);
  for (const overlay of extraSongs) {
    const id = overlay.id || slugify(overlay.title);
    const existing = byId.get(id) ?? [...byId.values()].find((song) => foldTitle(song.title) === foldTitle(overlay.title));
    const merged = mergeSong(existing, {
      ...overlay,
      id: existing?.id ?? id,
      kind: existing ? existing.kind : overlay.kind,
    });
    byId.set(merged.id, merged);
  }
  for (const [id, aliases] of Object.entries(aliasMap)) {
    const song = byId.get(id);
    if (!song) {
      console.warn(`alias overlay skipped, missing song ${id}`);
      continue;
    }
    song.aliases = [...new Set([...song.aliases, ...aliases])];
  }

  const songs = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
  const releases = [...mbReleases, ...extraReleases];
  const unknown = [];
  const concerts = concertDrafts.map((draft) => {
    const setlist = [];
    for (const [index, title] of (draft.songs ?? []).entries()) {
      const songId = findSongId(songs, title);
      if (!songId) {
        unknown.push(`${draft.id}: ${title}`);
        continue;
      }
      setlist.push({ songId, order: setlist.length + 1 });
    }
    return {
      id: draft.id,
      date: draft.date,
      venue: draft.venue,
      city: draft.city,
      tour: draft.tour,
      aliases: draft.aliases ?? [],
      setlist,
      confidence: draft.confidence ?? "partial",
      sourceUrl: draft.sourceUrl,
    };
  });

  await writeFile(path.join(dataDir, "songs.json"), `${JSON.stringify(songs, null, 2)}\n`);
  await writeFile(path.join(dataDir, "releases.json"), `${JSON.stringify(releases, null, 2)}\n`);
  await writeFile(path.join(dataDir, "concerts.json"), `${JSON.stringify(concerts, null, 2)}\n`);
  console.log(`Wrote songs=${songs.length} releases=${releases.length} concerts=${concerts.length}`);
  if (unknown.length) {
    console.warn(`Unmatched setlist titles (${unknown.length}):`);
    for (const row of unknown) console.warn(`  ${row}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
