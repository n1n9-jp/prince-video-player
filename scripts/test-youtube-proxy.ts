import assert from "node:assert/strict";
import { googleYoutubeUrl, parseYoutubeRoute, SITE_REFERER, youtubeKeyConfigured } from "../worker/youtube.ts";

const dropped = parseYoutubeRoute(
  "/api/youtube/search",
  new URLSearchParams({
    q: "prince purple rain",
    key: "should-not-leak",
    part: "snippet",
    type: "video",
    maxResults: "999",
    callback: "alert(1)",
  }),
);
assert.equal(dropped.kind, "proxy");
if (dropped.kind !== "proxy") throw new Error("unreachable");
assert.equal(dropped.resource, "search");
assert.equal(dropped.params.get("q"), "prince purple rain");
assert.equal(dropped.params.get("part"), "snippet");
assert.equal(dropped.params.get("type"), "video");
assert.equal(dropped.params.get("maxResults"), "50");
assert.equal(dropped.params.get("key"), null);
assert.equal(dropped.params.get("callback"), null);

const google = new URL(googleYoutubeUrl(dropped.resource, dropped.params, "server-secret"));
assert.equal(google.origin + google.pathname, "https://www.googleapis.com/youtube/v3/search");
assert.equal(google.searchParams.get("key"), "server-secret");
assert.equal(google.searchParams.get("q"), "prince purple rain");

assert.equal(parseYoutubeRoute("/api/youtube/status", new URLSearchParams()).kind, "status");
assert.equal(parseYoutubeRoute("/api/youtube/evil", new URLSearchParams()).kind, "error");
assert.equal(parseYoutubeRoute("/api/library", new URLSearchParams()).kind, "error");
assert.equal(parseYoutubeRoute("/api/youtube/search/extra", new URLSearchParams()).kind, "error");

const videos = parseYoutubeRoute("/api/youtube/videos", new URLSearchParams({ part: "status", id: "abcdefghijk" }));
assert.equal(videos.kind, "proxy");
if (videos.kind === "proxy") assert.equal(videos.resource, "videos");

assert.equal(new URL(SITE_REFERER).origin, "https://prince-tube.tokyo-air.workers.dev");
assert.match(new URL(SITE_REFERER).pathname, /^\/.+/);

assert.equal(youtubeKeyConfigured({}), false);
assert.equal(youtubeKeyConfigured({ YOUTUBE_API_KEY: "   " }), false);
assert.equal(youtubeKeyConfigured({ YOUTUBE_API_KEY: "abc" }), true);

console.log("youtube proxy ok");
