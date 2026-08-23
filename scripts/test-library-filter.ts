import assert from "node:assert/strict";
import { visibleLibraryVideos } from "../src/library/visible.ts";
import type { Video } from "../src/storage/types.ts";

function video(id: string, title = id): Video {
  return { id, title, channelTitle: "ch", thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
}

const videos = [video("a", "Purple Rain"), video("b", "Kiss"), video("c", "Dead")];

const shown = visibleLibraryVideos(videos, {
  videoTags: {},
  unplayableIds: ["c"],
  playlistIds: ["b"],
  kind: "all",
  query: "",
  hideUnplayable: true,
  hideInPlaylist: true,
});
assert.deepEqual(
  shown.map((item) => item.id),
  ["a"],
);

const all = visibleLibraryVideos(videos, {
  videoTags: {},
  unplayableIds: ["c"],
  playlistIds: ["b"],
  kind: "all",
  query: "",
  hideUnplayable: false,
  hideInPlaylist: false,
});
assert.deepEqual(
  all.map((item) => item.id),
  ["a", "b", "c"],
);

console.log("library filters ok");
