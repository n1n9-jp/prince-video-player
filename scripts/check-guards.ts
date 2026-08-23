import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SITE_REFERER } from "../worker/youtube.ts";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

assert.equal(
  /if:\s*.*secrets\./.test(workflow),
  false,
  "GitHub rejects workflow files that read secrets in if:",
);

assert.equal(
  /uses:\s*cloudflare\/wrangler-action[\s\S]*?\n\s+secrets:/.test(workflow),
  false,
  "wrangler-action secrets: uploads before deploy and hits Cloudflare 10215",
);

assert.equal(
  /npm run build[\s\S]{0,400}VITE_YOUTUBE_API_KEY:/.test(workflow),
  false,
  "do not bake VITE_YOUTUBE_API_KEY into the client bundle",
);

assert.match(
  workflow,
  /npx wrangler secret bulk/,
  "production must put YOUTUBE_API_KEY after wrangler deploy",
);

const referer = new URL(SITE_REFERER);
assert.equal(referer.origin, "https://prince-tube.tokyo-air.workers.dev");
assert.notEqual(referer.pathname, "/");
assert.match(referer.pathname, /^\/.+/);

console.log("ops guards ok");
