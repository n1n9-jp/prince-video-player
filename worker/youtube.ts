const GOOGLE = "https://www.googleapis.com/youtube/v3";
/** Path form matches Google's `https://host/*` referrer rule; bare `https://host/` often does not. */
export const SITE_REFERER = "https://prince-tube.tokyo-air.workers.dev/index.html";
export const SITE_ORIGIN = "https://prince-tube.tokyo-air.workers.dev";

const RESOURCES = {
  search: new Set(["part", "type", "videoEmbeddable", "videoSyndicated", "maxResults", "q", "pageToken"]),
  videos: new Set(["part", "id"]),
  channels: new Set(["part", "id", "forHandle", "forUsername"]),
  playlistItems: new Set(["part", "playlistId", "maxResults", "pageToken"]),
} as const;

type Resource = keyof typeof RESOURCES;

export type YoutubeEnv = { YOUTUBE_API_KEY?: string };

export type YoutubeRoute =
  | { kind: "status" }
  | { kind: "proxy"; resource: Resource; params: URLSearchParams }
  | { kind: "error"; status: number; message: string };

export function youtubeKeyConfigured(env: YoutubeEnv): boolean {
  return Boolean(env.YOUTUBE_API_KEY?.trim());
}

export function parseYoutubeRoute(pathname: string, search: URLSearchParams): YoutubeRoute {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "api" || parts[1] !== "youtube") {
    return { kind: "error", status: 404, message: "not found" };
  }
  const name = parts[2];
  if (name === "status") return { kind: "status" };
  if (!(name in RESOURCES)) return { kind: "error", status: 404, message: "not found" };
  const resource = name as Resource;
  const allowed = RESOURCES[resource];
  const params = new URLSearchParams();
  for (const key of search.keys()) {
    if (key === "key") continue;
    if (!allowed.has(key)) continue;
    const value = search.get(key)?.trim() ?? "";
    if (!value) continue;
    if (key === "maxResults") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      params.set(key, String(Math.min(50, Math.max(1, Math.trunc(n)))));
      continue;
    }
    params.set(key, value);
  }
  return { kind: "proxy", resource, params };
}

export function googleYoutubeUrl(resource: Resource, params: URLSearchParams, apiKey: string): string {
  const url = new URL(`${GOOGLE}/${resource}`);
  url.search = params.toString();
  url.searchParams.set("key", apiKey);
  return url.toString();
}

type CorsFn = (request: Request) => HeadersInit;

export async function handleYoutube(
  request: Request,
  env: YoutubeEnv,
  url: URL,
  cors: CorsFn,
): Promise<Response> {
  if (request.method !== "GET") {
    return json(request, cors, { error: { message: "method not allowed" } }, 405);
  }

  const route = parseYoutubeRoute(url.pathname, url.searchParams);
  if (route.kind === "error") {
    return json(request, cors, { error: { message: route.message } }, route.status);
  }
  if (route.kind === "status") {
    return json(request, cors, { configured: youtubeKeyConfigured(env) });
  }

  const apiKey = env.YOUTUBE_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return json(
      request,
      cors,
      {
        error: {
          message: "本番の YouTube 検索キーが未設定です。GitHub Secrets に YOUTUBE_API_KEY を入れて再デプロイしてください。",
        },
      },
      503,
    );
  }

  const googleUrl = googleYoutubeUrl(route.resource, route.params, apiKey);
  const googleRes = await fetch(googleUrl, {
    headers: {
      accept: "application/json",
      origin: SITE_ORIGIN,
      referer: SITE_REFERER,
    },
  });
  const body = await googleRes.arrayBuffer();
  const contentType = googleRes.headers.get("content-type") ?? "application/json; charset=utf-8";
  return new Response(body, {
    status: googleRes.status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      ...cors(request),
    },
  });
}

function json(request: Request, cors: CorsFn, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...cors(request),
    },
  });
}
