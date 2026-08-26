import assert from "node:assert/strict";
import { catalogIndex } from "../src/catalog/index.ts";
import { buildYearIndex, parseYearPlaylistId, pickRandomSelection, songYear, videosForYear, yearPlaylistId, yearPlaylists } from "../src/components/YearExplore.tsx";
import type { Video } from "../src/storage/types.ts";
import type { VideoTagging } from "../src/catalog/types.ts";

function video(id: string): Video {
  return { id, title: id, channelTitle: "ch", thumbnailUrl: "" };
}

function tagging(...songIds: string[]): VideoTagging {
  return { songIds, releaseIds: [], source: "manual", confidence: "high" };
}

const doves = catalogIndex.songsById.get("when-doves-cry");
assert.ok(doves);
assert.equal(songYear(doves), 1984);

assert.equal(
  songYear({
    id: "no-year",
    title: "No Year",
    aliases: [],
    kind: "official",
    firstReleaseId: "purple-rain",
    confidence: "high",
  }),
  1984,
);

const videos = { a: video("a"), b: video("b") };
const index = buildYearIndex(videos, {
  a: tagging("when-doves-cry", "not-a-catalog-song"),
  b: tagging("when-doves-cry"),
  missing: tagging("when-doves-cry"),
});

assert.equal(index.bars.length, 1);
assert.deepEqual(index.bars[0], { year: 1984, count: 1 });
assert.equal(index.songsByYear.has(1985), false);

const songs = index.songsByYear.get(1984);
assert.ok(songs);
assert.equal(songs.length, 1);
assert.equal(songs[0]?.song.id, "when-doves-cry");
assert.deepEqual(songs[0]?.videoIds, ["a", "b"]);

assert.deepEqual(videosForYear(index, 1984), ["a", "b"]);
assert.deepEqual(videosForYear(index, 1985), []);
assert.equal(yearPlaylistId(1984), "year-1984");
assert.equal(parseYearPlaylistId("year-1984"), 1984);
assert.equal(parseYearPlaylistId("live"), null);

const auto = yearPlaylists(index, videos, []);
assert.equal(auto.length, 1);
assert.equal(auto[0]?.id, "year-1984");
assert.equal(auto[0]?.name, "1984年");
assert.deepEqual(auto[0]?.videoIds, ["a", "b"]);
assert.equal(yearPlaylists(index, videos, ["a", "b"]).length, 0);

assert.equal(buildYearIndex({}, { a: tagging("when-doves-cry") }).bars.length, 0);

assert.equal(pickRandomSelection({ bars: [], songsByYear: new Map() }), null);
const only = pickRandomSelection(index);
assert.deepEqual(only, { year: 1984, songId: "when-doves-cry" });

console.log("ok year explore index");
