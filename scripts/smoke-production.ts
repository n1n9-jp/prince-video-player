const BASE = "https://prince-tube.tokyo-air.workers.dev";
const SAMPLE_VIDEO = "Zi9nlmMA12Y";

type YoutubeStatus = { configured?: boolean };
type LibraryBody = { videos?: Record<string, unknown>; error?: string };

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const status = await get("/api/youtube/status");
if (status.status !== 200) fail(`/api/youtube/status HTTP ${status.status}`);
const configured = (status.body as YoutubeStatus).configured;
if (!configured) fail("/api/youtube/status configured=false — GitHub Secret YOUTUBE_API_KEY is missing on the Worker");

const probe = await get(`/api/youtube/videos?part=id&id=${SAMPLE_VIDEO}`);
if (probe.status !== 200) {
  const message =
    probe.body && typeof probe.body === "object" && "error" in probe.body
      ? JSON.stringify((probe.body as { error?: unknown }).error)
      : `HTTP ${probe.status}`;
  fail(`/api/youtube/videos failed: ${message}`);
}

const library = await get("/api/library");
if (library.status === 404) {
  fail("/api/library is empty — KV has no canonical copy. Deploys do not restore it.");
}
if (library.status !== 200) fail(`/api/library HTTP ${library.status}`);
const videos = (library.body as LibraryBody).videos ?? {};
const count = Object.keys(videos).length;
if (count < 8) {
  fail(`/api/library looks empty or starter-shaped (${count} videos)`);
}

console.log(`smoke ok: youtube configured, library videos=${count}`);
