import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPlayer, loadYoutubeApi } from "../youtube/iframePlayer";
import type { Video } from "../storage/types";

export type PlayerHandle = {
  play: () => void;
  loadAndPlay: (id: string) => void;
};

type Props = {
  video: Video | null;
  sessionActive: boolean;
  autoplayBlocked: boolean;
  skipNotice: string | null;
  emptyHint: string;
  onStart: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnded: () => void;
  onError: (code: number) => void;
  onPlaying: () => void;
  onAutoplayBlocked: () => void;
};

export const PlayerStage = forwardRef<PlayerHandle, Props>(function PlayerStage(
  {
    video,
    sessionActive,
    autoplayBlocked,
    skipNotice,
    emptyHint,
    onStart,
    onPrev,
    onNext,
    onEnded,
    onError,
    onPlaying,
    onAutoplayBlocked,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const pendingPlayRef = useRef(false);
  const [playerReady, setPlayerReady] = useState(false);
  const videoId = video?.id ?? null;
  const hasVideo = Boolean(videoId);

  const handlersRef = useRef({ onEnded, onError, onPlaying, onAutoplayBlocked });
  handlersRef.current = { onEnded, onError, onPlaying, onAutoplayBlocked };

  useEffect(() => {
    void loadYoutubeApi();
  }, []);

  useEffect(() => {
    if (!hasVideo) return;
    let cancelled = false;
    let localPlayer: YT.Player | null = null;
    const initialId = videoId;
    if (!initialId) return;

    void loadYoutubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      localPlayer = createPlayer(hostRef.current, initialId, {
        onReady: () => {
          if (cancelled) return;
          playerRef.current = localPlayer;
          setPlayerReady(true);
          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            localPlayer?.playVideo();
          }
        },
        onPlaying: () => handlersRef.current.onPlaying(),
        onEnded: () => handlersRef.current.onEnded(),
        onError: (code) => handlersRef.current.onError(code),
        onAutoplayBlocked: () => handlersRef.current.onAutoplayBlocked(),
      });
      playerRef.current = localPlayer;
    });

    return () => {
      cancelled = true;
      setPlayerReady(false);
      localPlayer?.destroy();
      playerRef.current = null;
    };
  }, [hasVideo]);

  useEffect(() => {
    if (!playerReady || !playerRef.current || !videoId) return;
    const current = playerRef.current.getVideoData?.()?.video_id;
    if (current === videoId) return;
    if (!sessionActive) playerRef.current.cueVideoById(videoId);
  }, [videoId, playerReady, sessionActive]);

  function playNow(id?: string) {
    const player = playerRef.current;
    const targetId = id ?? videoId;
    if (!player || !playerReady || !targetId) {
      pendingPlayRef.current = true;
      return;
    }
    const current = player.getVideoData?.()?.video_id;
    if (current === targetId) player.playVideo();
    else player.loadVideoById(targetId);
  }

  useImperativeHandle(ref, () => ({
    play() {
      playNow();
    },
    loadAndPlay(id: string) {
      playNow(id);
    },
  }));

  const showOverlay = !sessionActive || autoplayBlocked || !video;

  function handleStart() {
    playNow();
    onStart();
  }

  return (
    <section className="stage-player">
      <div className="player-frame">
        <div className="player-host" ref={hostRef} />
        {showOverlay && (
          <div className="player-overlay">
            {video ? (
              <>
                <img src={video.thumbnailUrl} alt="" className="player-poster" />
                <div className="player-overlay-copy">
                  <p className="now-kicker">{autoplayBlocked ? "再生がブロックされました" : "Now playing"}</p>
                  <h2>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {video.title}
                    </a>
                  </h2>
                  <p className="channel">{video.channelTitle}</p>
                  <button type="button" className="btn-gold" onClick={handleStart}>
                    {autoplayBlocked ? "再開" : "再生開始"}
                  </button>
                </div>
              </>
            ) : (
              <div className="player-overlay-copy">
                <p className="now-kicker">Empty lounge</p>
                <h2>まだ曲がありません</h2>
                <p className="channel">{emptyHint}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="transport">
        <button type="button" className="btn-ghost" onClick={onPrev} disabled={!video}>
          前へ
        </button>
        <div className="now-text">
          {video ? (
            <>
              <strong>
                <a
                  href={`https://www.youtube.com/watch?v=${video.id}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {video.title}
                </a>
              </strong>
              <span>{video.channelTitle}</span>
            </>
          ) : (
            <strong>待機中</strong>
          )}
        </div>
        <button type="button" className="btn-ghost" onClick={onNext} disabled={!video}>
          次へ
        </button>
      </div>
      {skipNotice && <p className="skip-notice">{skipNotice}</p>}
    </section>
  );
});
