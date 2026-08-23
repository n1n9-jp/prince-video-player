import { isDangerousReplace, isStarterShaped, parseState, richness } from "./parse";
import type { AppState } from "./types";

export const LIBRARY_API = "/api/library";

export type PushResult =
  | { ok: true }
  | { ok: false; kept: AppState | null; reason: string };

function parseBody(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return parseState(record.kept ?? record);
}

export async function pullLibrary(): Promise<AppState | null> {
  try {
    const res = await fetch(LIBRARY_API, { headers: { accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return parseState(await res.json());
  } catch {
    return null;
  }
}

export async function pushLibrary(state: AppState, options?: { force?: boolean }): Promise<PushResult> {
  if (isStarterShaped(state) && !options?.force) return { ok: true };
  try {
    const url = options?.force ? `${LIBRARY_API}?force=1` : LIBRARY_API;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(state),
    });
    if (res.ok) return { ok: true };
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    const kept = parseBody(payload);
    const reason =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `save failed (${res.status})`;
    if (kept && (isDangerousReplace(state, kept) || richness(kept) >= richness(state))) {
      return { ok: false, kept, reason };
    }
    return { ok: false, kept, reason };
  } catch {
    return { ok: false, kept: null, reason: "network" };
  }
}
