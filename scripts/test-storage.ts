import assert from "node:assert/strict";
import { STARTER_VIDEOS } from "../src/storage/seed.ts";
import {
  BACKUP_KEY,
  STORAGE_KEY,
  hydrateState,
  isStarterShaped,
  localStore,
  mergeStates,
  parseState,
  richness,
} from "../src/storage/localStore.ts";
import type { AppState, Video } from "../src/storage/types.ts";

function video(id: string, title = id): Video {
  return { id, title, channelTitle: "ch", thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
}

function sample(n: number): AppState {
  const videos: Record<string, Video> = {};
  const videoIds: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `vid${i}`;
    videos[id] = video(id, `Song ${i}`);
    videoIds.push(id);
  }
  return {
    videos,
    playlists: [{ id: "p1", name: "Mine", videoIds }],
    activePlaylistId: "p1",
    watchCounts: { vid0: 4 },
    playMode: "shuffle",
    currentVideoId: "vid0",
    unplayableIds: [],
    autoplayNext: true,
    starterVersion: 1,
    videoTags: {},
  };
}

function installMemoryStorage() {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.has(key) ? (data.get(key) ?? null) : null;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  return data;
}

const skipped = parseState({
  videos: {
    good: video("good", "Purple Rain"),
    bad: { id: "bad", title: 1 },
  },
  playlists: [
    { id: "p1", name: "A", videoIds: ["good", 3, "good"] },
    { id: "nope" },
  ],
  watchCounts: { good: "2", bad: -1, other: Number.NaN },
  playMode: "nope",
  currentVideoId: 12,
});
assert.ok(skipped);
assert.equal(Object.keys(skipped.videos).join(","), "good");
assert.equal(skipped.playlists.length, 1);
assert.deepEqual(skipped.playlists[0]?.videoIds, ["good"]);
assert.equal(skipped.watchCounts.good, 2);
assert.equal(skipped.playMode, "sequential");
assert.equal(skipped.currentVideoId, null);
console.log("ok parse skips bad records instead of discarding the library");

const fromArray = parseState({
  videos: [video("a"), { title: "no-id" }, video("b")],
  playlists: [{ id: "p", name: "L", videoIds: ["a", "b"] }],
});
assert.ok(fromArray);
assert.deepEqual(Object.keys(fromArray.videos).sort(), ["a", "b"]);
console.log("ok parse accepts a videos array");

const mismatched = parseState({
  videos: { "wrong-key": video("real-id", "Kiss") },
  playlists: [{ id: "p", name: "L", videoIds: ["real-id"] }],
  watchCounts: {},
  playMode: "leastPlayed",
});
assert.ok(mismatched);
assert.ok(mismatched.videos["real-id"]);
assert.equal(mismatched.playMode, "leastPlayed");
console.log("ok parse keeps a video whose object key does not match id");

const merged = mergeStates(sample(2), {
  ...sample(3),
  playlists: [
    { id: "p1", name: "Mine+", videoIds: ["vid2"] },
    { id: "p2", name: "Second", videoIds: ["vid0"] },
  ],
  watchCounts: { vid0: 1, vid2: 9 },
  videoTags: { vid2: { songIds: ["s1"], releaseIds: [], source: "manual", confidence: "high" } },
});
assert.equal(Object.keys(merged.videos).length, 3);
assert.deepEqual(merged.playlists.find((p) => p.id === "p1")?.videoIds, ["vid0", "vid1", "vid2"]);
assert.equal(merged.playlists.length, 2);
assert.equal(merged.watchCounts.vid0, 4);
assert.equal(merged.watchCounts.vid2, 9);
assert.equal(merged.videoTags.vid2?.source, "manual");
console.log("ok merge unions videos, playlists, and watch counts");

installMemoryStorage();
const rich = sample(12);
localStorage.setItem(BACKUP_KEY, JSON.stringify(rich));
localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrateState(parseState({ videos: {}, playlists: [] })!)));
localStore.takeRestoredNotice();
const restored = localStore.load();
assert.ok(Object.keys(restored.videos).length >= 12, "backup library should come back");
assert.ok(localStore.takeRestoredNotice());
assert.ok(richness(restored) >= richness(rich));
console.log("ok load restores a richer backup over starter storage");

installMemoryStorage();
localStorage.setItem(STORAGE_KEY, JSON.stringify(rich));
localStore.save(hydrateState(parseState({ videos: {}, playlists: [] })!));
const kept = parseState(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
assert.ok(kept);
assert.equal(Object.keys(kept.videos).length, 12);
console.log("ok save refuses to replace a full library with starter data");

installMemoryStorage();
localStorage.setItem(STORAGE_KEY, "{not-json");
localStore.save(hydrateState(parseState({ videos: {}, playlists: [] })!));
assert.equal(localStorage.getItem(STORAGE_KEY), "{not-json");
console.log("ok save keeps unreadable storage instead of writing starter data");

const starter = hydrateState(parseState({ videos: {}, playlists: [], starterVersion: 0 })!);
assert.ok(isStarterShaped(starter));
assert.ok(STARTER_VIDEOS.every((item) => starter.videos[item.id]));
console.log("ok starter-shaped detection");
