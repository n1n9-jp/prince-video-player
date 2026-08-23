const API_SRC = "https://www.youtube.com/iframe_api";
const REFERRER_POLICY = "strict-origin-when-cross-origin";

let apiPromise: Promise<void> | null = null;

export function loadYoutubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const tag = document.createElement("script");
      tag.src = API_SRC;
      document.head.appendChild(tag);
    }
    if (window.YT?.Player) resolve();
  });

  return apiPromise;
}

export type PlayerHandlers = {
  onReady?: () => void;
  onPlaying?: () => void;
  onPaused?: () => void;
  onEnded: () => void;
  onError: (code: number) => void;
  onAutoplayBlocked: () => void;
};

function applyReferrerPolicy(iframe: HTMLIFrameElement): void {
  iframe.referrerPolicy = REFERRER_POLICY;
  iframe.setAttribute("referrerpolicy", REFERRER_POLICY);
}

const BLOCKED_EMBED_ERRORS = new Set([101, 150, 100, 2]);

export async function keepCueable<T extends { id: string }>(videos: T[]): Promise<T[]> {
  if (videos.length === 0 || typeof document === "undefined") return videos;
  await loadYoutubeApi();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:320px;height:180px;overflow:hidden;pointer-events:none;";
  document.body.appendChild(host);

  let handleError: (code: number) => void = () => {};
  let handleState: (state: number) => void = () => {};
  let player: YT.Player | null = null;

  try {
    const iframe = document.createElement("iframe");
    applyReferrerPolicy(iframe);
    iframe.setAttribute("allow", "autoplay; encrypted-media");
    iframe.title = "embed probe";
    iframe.style.width = "320px";
    iframe.style.height = "180px";
    iframe.style.border = "0";
    host.replaceChildren(iframe);

    const first = videos[0];
    if (!first) return videos;

    const params = new URLSearchParams({
      enablejsapi: "1",
      origin: window.location.origin,
      rel: "0",
    });
    iframe.src = `https://www.youtube.com/embed/${first.id}?${params.toString()}`;

    player = await new Promise<YT.Player>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("埋め込み確認用プレーヤーを初期化できませんでした")), 10000);
      const created = new YT.Player(iframe, {
        events: {
          onReady(event) {
            window.clearTimeout(timer);
            applyReferrerPolicy(event.target.getIframe());
            resolve(created);
          },
          onStateChange(event) {
            handleState(event.data);
          },
          onError(event) {
            handleError(event.data);
          },
        },
      });
    });

    const playable: T[] = [];
    for (const video of videos) {
      const ok = await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          handleError = () => {};
          handleState = () => {};
          clearTimeout(timer);
          resolve(value);
        };
        const timer = window.setTimeout(() => finish(false), 5000);
        handleError = (code) => {
          if (code === 153) return;
          finish(!BLOCKED_EMBED_ERRORS.has(code));
        };
        handleState = (state) => {
          if (state === YT.PlayerState.CUED || state === YT.PlayerState.PLAYING) finish(true);
        };
        player?.cueVideoById(video.id);
        const current = player?.getVideoData?.()?.video_id;
        const state = player?.getPlayerState();
        if (
          current === video.id &&
          (state === YT.PlayerState.CUED || state === YT.PlayerState.PLAYING)
        ) {
          finish(true);
        }
      });
      if (ok) playable.push(video);
    }
    return playable;
  } finally {
    try {
      player?.destroy();
    } catch {
      /* ignore */
    }
    host.remove();
  }
}

export function createPlayer(host: HTMLElement, videoId: string, handlers: PlayerHandlers): YT.Player {
  const iframe = document.createElement("iframe");
  applyReferrerPolicy(iframe);
  iframe.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
  );
  iframe.setAttribute("allowfullscreen", "true");
  iframe.title = "YouTube player";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  host.replaceChildren(iframe);

  const params = new URLSearchParams({
    enablejsapi: "1",
    origin: window.location.origin,
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  iframe.src = `https://www.youtube.com/embed/${videoId}?${params.toString()}`;

  return new YT.Player(iframe, {
    events: {
      onReady(event) {
        applyReferrerPolicy(event.target.getIframe());
        handlers.onReady?.();
      },
      onStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) handlers.onPlaying?.();
        if (event.data === YT.PlayerState.PAUSED) handlers.onPaused?.();
        if (event.data === YT.PlayerState.ENDED) handlers.onEnded();
      },
      onError(event) {
        handlers.onError(event.data);
      },
      onAutoplayBlocked() {
        handlers.onAutoplayBlocked();
      },
    },
  });
}
