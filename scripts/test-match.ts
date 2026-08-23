import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STARTER_VIDEOS } from "../src/storage/seed.ts";
import { buildIndex } from "../src/catalog/index.ts";
import { tagTitle } from "../src/catalog/match.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(root, "src", "catalog", "data", name), "utf8"));
}

const index = buildIndex({
  songs: loadJson("songs.json"),
  releases: loadJson("releases.json"),
  concerts: loadJson("concerts.json"),
});

const expected = JSON.parse(readFileSync(path.join(root, "scripts", "fixtures", "title-match.json"), "utf8"));

for (const video of STARTER_VIDEOS) {
  const got = tagTitle(video.title, index);
  const want = expected[video.id];
  assert.ok(want, `missing fixture for ${video.id}`);
  assert.ok(got, `no tags for ${video.title}`);
  for (const songId of want.songIds) {
    assert.ok(got.songIds.includes(songId), `${video.title} missing song ${songId}; got ${got.songIds.join(",")}`);
  }
  if (want.concertId) {
    assert.equal(got.concertId, want.concertId, `${video.title} concert`);
  }
  if (want.releaseIds) {
    for (const releaseId of want.releaseIds) {
      assert.ok(got.releaseIds.includes(releaseId), `${video.title} missing release ${releaseId}`);
    }
  }
  console.log(`ok ${video.id} → songs=${got.songIds.length} concert=${got.concertId ?? "-"}`);
}
