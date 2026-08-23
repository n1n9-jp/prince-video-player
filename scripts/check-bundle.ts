import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const KEY = /AIzaSy[0-9A-Za-z_-]{10,}/;
const root = "dist";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const files = walk(root);
assert.ok(files.length > 0, "dist is empty; run npm run build first");
for (const file of files) {
  if (!/\.(js|css|html|map)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  assert.equal(KEY.test(text), false, `client bundle must not contain a Google API key (${file})`);
}

console.log("bundle has no Google API key");
