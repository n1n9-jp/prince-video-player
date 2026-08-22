import type { PlayMode } from "../storage/types";

export type NextVideoInput = {
  mode: PlayMode;
  videoIds: string[];
  currentVideoId: string | null;
  watchCounts: Record<string, number>;
  shuffleOrder: string[];
};

export type NextVideoResult = {
  videoId: string | null;
  shuffleOrder: string[];
};

export function shuffledCopy(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function reshuffle(ids: string[], avoidFirst: string | null): string[] {
  const order = shuffledCopy(ids);
  if (avoidFirst && order.length > 1 && order[0] === avoidFirst) {
    const swapAt = 1 + Math.floor(Math.random() * (order.length - 1));
    const first = order[0]!;
    order[0] = order[swapAt]!;
    order[swapAt] = first;
  }
  return order;
}

function ensureShuffleOrder(ids: string[], shuffleOrder: string[], avoidFirst: string | null): string[] {
  if (sameSet(ids, shuffleOrder) && shuffleOrder.length > 0) return shuffleOrder;
  return reshuffle(ids, avoidFirst);
}

function sequentialNext(ids: string[], currentVideoId: string | null): string | null {
  if (ids.length === 0) return null;
  if (!currentVideoId) return ids[0] ?? null;
  const index = ids.indexOf(currentVideoId);
  if (index === -1) return ids[0] ?? null;
  return ids[(index + 1) % ids.length] ?? null;
}

function sequentialPrev(ids: string[], currentVideoId: string | null): string | null {
  if (ids.length === 0) return null;
  if (!currentVideoId) return ids[ids.length - 1] ?? null;
  const index = ids.indexOf(currentVideoId);
  if (index === -1) return ids[ids.length - 1] ?? null;
  return ids[(index - 1 + ids.length) % ids.length] ?? null;
}

function leastPlayedNext(ids: string[], currentVideoId: string | null, watchCounts: Record<string, number>): string | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0] ?? null;
  let min = Infinity;
  for (const id of ids) {
    const count = watchCounts[id] ?? 0;
    if (count < min) min = count;
  }
  const tied = ids.filter((id) => (watchCounts[id] ?? 0) === min);
  const candidates = tied.length > 1 ? tied.filter((id) => id !== currentVideoId) : tied;
  return candidates[0] ?? tied[0] ?? null;
}

export function nextVideo(input: NextVideoInput): NextVideoResult {
  const { mode, videoIds, currentVideoId, watchCounts } = input;
  if (videoIds.length === 0) return { videoId: null, shuffleOrder: [] };

  if (mode === "sequential") {
    return { videoId: sequentialNext(videoIds, currentVideoId), shuffleOrder: input.shuffleOrder };
  }

  if (mode === "leastPlayed") {
    return {
      videoId: leastPlayedNext(videoIds, currentVideoId, watchCounts),
      shuffleOrder: input.shuffleOrder,
    };
  }

  const shuffleOrder = ensureShuffleOrder(videoIds, input.shuffleOrder, currentVideoId);
  if (!currentVideoId) return { videoId: shuffleOrder[0] ?? null, shuffleOrder };
  const index = shuffleOrder.indexOf(currentVideoId);
  if (index === -1) return { videoId: shuffleOrder[0] ?? null, shuffleOrder };
  if (index >= shuffleOrder.length - 1) {
    const nextOrder = reshuffle(videoIds, currentVideoId);
    return { videoId: nextOrder[0] ?? null, shuffleOrder: nextOrder };
  }
  return { videoId: shuffleOrder[index + 1] ?? null, shuffleOrder };
}

export function previousVideo(input: NextVideoInput): NextVideoResult {
  const { mode, videoIds, currentVideoId } = input;
  if (videoIds.length === 0) return { videoId: null, shuffleOrder: [] };

  if (mode === "shuffle") {
    const shuffleOrder = ensureShuffleOrder(videoIds, input.shuffleOrder, currentVideoId);
    if (!currentVideoId) return { videoId: shuffleOrder[shuffleOrder.length - 1] ?? null, shuffleOrder };
    const index = shuffleOrder.indexOf(currentVideoId);
    if (index <= 0) return { videoId: shuffleOrder[shuffleOrder.length - 1] ?? null, shuffleOrder };
    return { videoId: shuffleOrder[index - 1] ?? null, shuffleOrder };
  }

  return { videoId: sequentialPrev(videoIds, currentVideoId), shuffleOrder: input.shuffleOrder };
}

export function startVideo(input: NextVideoInput): NextVideoResult {
  const { videoIds, currentVideoId } = input;
  if (videoIds.length === 0) return { videoId: null, shuffleOrder: [] };
  if (currentVideoId && videoIds.includes(currentVideoId)) {
    const shuffleOrder =
      input.mode === "shuffle" ? ensureShuffleOrder(videoIds, input.shuffleOrder, null) : input.shuffleOrder;
    return { videoId: currentVideoId, shuffleOrder };
  }
  return nextVideo({ ...input, currentVideoId: null });
}
