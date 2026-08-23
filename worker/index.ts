import { isDangerousReplace, isStarterShaped, parseState } from "../src/storage/parse";
import type { AppState } from "../src/storage/types";
import { handleYoutube, type YoutubeEnv } from "./youtube";

type WorkerEnv = Env & YoutubeEnv;

const KEY = "library";
const PREV_KEY = "library:prev";
const MAX_BYTES = 2_000_000;

function allowOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return origin;
    if (url.hostname === "prince-tube.tokyo-air.workers.dev") return origin;
    if (url.hostname.endsWith(".prince-tube.tokyo-air.workers.dev")) return origin;
  } catch {
    return null;
  }
  return null;
}

function corsHeaders(request: Request): HeadersInit {
  const origin = allowOrigin(request.headers.get("Origin"));
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, accept",
    vary: "Origin",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  return headers;
}

function json(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

async function readLibrary(env: Env): Promise<AppState | null> {
  const raw = await env.LIBRARY.get(KEY, "json");
  return parseState(raw);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (url.pathname === "/api/youtube/status" || url.pathname.startsWith("/api/youtube/")) {
      return handleYoutube(request, env, url, corsHeaders);
    }
    if (url.pathname !== "/api/library") {
      return new Response("Not found", { status: 404, headers: corsHeaders(request) });
    }
    if (request.method === "GET") {
      const existing = await readLibrary(env);
      if (!existing) return json(request, { error: "empty" }, 404);
      return json(request, existing);
    }
    if (request.method !== "PUT") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(request) });
    }

    const lengthHeader = request.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
      return json(request, { error: "payload too large" }, 413);
    }
    const incomingText = await request.text();
    if (incomingText.length > MAX_BYTES) {
      return json(request, { error: "payload too large" }, 413);
    }
    let incomingRaw: unknown;
    try {
      incomingRaw = JSON.parse(incomingText) as unknown;
    } catch {
      return json(request, { error: "invalid json" }, 400);
    }
    const incoming = parseState(incomingRaw);
    if (!incoming) return json(request, { error: "invalid library" }, 400);

    const existing = await readLibrary(env);
    const force = url.searchParams.get("force") === "1";
    if (existing && isStarterShaped(incoming) && !isStarterShaped(existing)) {
      return json(request, { error: "refusing to reset library", kept: existing }, 409);
    }
    if (existing && isDangerousReplace(existing, incoming) && !force) {
      return json(request, { error: "refusing to shrink library", kept: existing }, 409);
    }

    if (existing) await env.LIBRARY.put(PREV_KEY, JSON.stringify(existing));
    await env.LIBRARY.put(KEY, JSON.stringify(incoming));
    return json(request, incoming);
  },
} satisfies ExportedHandler<WorkerEnv>;
