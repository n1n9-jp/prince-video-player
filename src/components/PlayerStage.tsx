import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { VideoTagging } from "../catalog/types";
import { createPlayer, loadYoutubeApi } from "../youtube/iframePlayer";
import type { Video } from "../storage/types";
import { TagRow } from "./TagRow";

export type PlayerHandle = {
  play: () => void;
  loadAndPlay: (id: string) => void;
};

type Props = {
  video: Video | null;
  tagging?: VideoTagging;
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
    tagging,
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
                <button type="button" className="yt-play" onClick={handleStart}>
                  <span className="yt-play-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="28" height="28">
                      <path fill="currentColor" d="M8 5.1v13.8L20 12z" />
                    </svg>
                  </span>
                  {autoplayBlocked ? "再開" : "再生"}
                </button>
              </>
            ) : (
              <p className="player-empty">{emptyHint}</p>
            )}
          </div>
        )}
      </div>
      <div className="video-below">
        {video ? (
          <>
            <h1 className="video-title">
              <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer noopener">
                {video.title}
              </a>
            </h1>
            <TagRow tagging={tagging} />
            <div className="video-owner">
              <div className="channel-avatar" aria-hidden="true">
                {video.channelTitle.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p className="channel-name">{video.channelTitle}</p>
                <p className="channel-sub">PrinceTube</p>
              </div>
              <div className="video-owner-actions">
                <button type="button" className="btn-ghost" onClick={onPrev} disabled={!video}>
                  前へ
                </button>
                <button type="button" className="btn-ghost" onClick={onNext} disabled={!video}>
                  次へ
                </button>
              </div>
            </div>
          </>
        ) : (
          <h1 className="video-title muted">再生する動画を選んでください</h1>
        )}
        {skipNotice && <p className="skip-notice">{skipNotice}</p>}
      </div>
    </section>
  );
});
