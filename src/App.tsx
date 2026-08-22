import { useEffect, useRef, useState } from "react";
import { LibraryPanel } from "./components/LibraryPanel";
import { ModeToggle } from "./components/ModeToggle";
import { PlayerStage, type PlayerHandle } from "./components/PlayerStage";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { SearchPanel } from "./components/SearchPanel";
import { nextVideo, previousVideo, shuffledCopy, startVideo } from "./playback/nextVideo";
import { localStore } from "./storage/localStore";
import { activePlaylist, dropFromPlaylists, emptyState, type AppState, type PlayMode, type Video } from "./storage/types";
import { fetchChannelUploads, fetchVideoById, parseVideoId, searchVideos } from "./youtube/dataApi";
import { loadYoutubeApi } from "./youtube/iframePlayer";

export function App() {
  const [state, setState] = useState<AppState>(() => localStore.load());
  const [shuffleOrder, setShuffleOrder] = useState<string[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);

  const stateRef = useRef(state);
  const shuffleRef = useRef(shuffleOrder);
  const errorStreakRef = useRef(0);
  const playerRef = useRef<PlayerHandle>(null);
  stateRef.current = state;
  shuffleRef.current = shuffleOrder;

  useEffect(() => {
    void loadYoutubeApi();
  }, []);

  useEffect(() => {
    localStore.save(state);
  }, [state]);

  useEffect(() => {
    const list = activePlaylist(state);
    const first = list?.videoIds[0];
    if (state.currentVideoId || !first) return;
    setState((s) => (s.currentVideoId ? s : { ...s, currentVideoId: first }));
  }, [state.currentVideoId, state.playlists, state.activePlaylistId]);

  const playlist = activePlaylist(state);
  const currentVideo = state.currentVideoId ? (state.videos[state.currentVideoId] ?? null) : null;

  function patchShuffle(order: string[]) {
    shuffleRef.current = order;
    setShuffleOrder(order);
  }

  function playbackInput(s: AppState) {
    return {
      mode: s.playMode,
      videoIds: (activePlaylist(s)?.videoIds ?? []).filter((id) => !s.unplayableIds.includes(id)),
      currentVideoId: s.currentVideoId,
      watchCounts: s.watchCounts,
      shuffleOrder: shuffleRef.current,
    };
  }

  function start(videoId?: string) {
    const s = stateRef.current;
    const list = activePlaylist(s);
    const requested = videoId ?? s.currentVideoId;
    const current = requested && list?.videoIds.includes(requested) ? requested : null;
    const order = s.playMode === "shuffle" ? shuffledCopy(list?.videoIds ?? []) : shuffleRef.current;
    const result = startVideo({
      ...playbackInput(s),
      currentVideoId: current,
      shuffleOrder: order,
    });
    patchShuffle(result.shuffleOrder);
    setState({ ...s, currentVideoId: result.videoId });
    setAutoplayBlocked(false);
    setSessionActive(Boolean(result.videoId));
    if (result.videoId) playerRef.current?.loadAndPlay(result.videoId);
  }

  function advance(kind: "next" | "prev" | "ended" | "error") {
    const s = stateRef.current;
    const list = activePlaylist(s);
    if (!list || list.videoIds.length === 0) {
      setSessionActive(false);
      return;
    }
    if (kind === "ended") errorStreakRef.current = 0;
    if (kind === "error") {
      errorStreakRef.current += 1;
      if (errorStreakRef.current >= list.videoIds.length) {
        setSessionActive(false);
        return;
      }
    }
    const watchCounts =
      kind === "ended" && s.currentVideoId
        ? { ...s.watchCounts, [s.currentVideoId]: (s.watchCounts[s.currentVideoId] ?? 0) + 1 }
        : s.watchCounts;
    if (kind === "ended" && !s.autoplayNext) {
      setState({ ...s, watchCounts });
      setSessionActive(false);
      return;
    }
    const input = { ...playbackInput(s), watchCounts };
    const result = kind === "prev" ? previousVideo(input) : nextVideo(input);
    patchShuffle(result.shuffleOrder);
    setState({ ...s, watchCounts, currentVideoId: result.videoId });
    if (!result.videoId) setSessionActive(false);
    else playerRef.current?.loadAndPlay(result.videoId);
  }

  function addToLibrary(video: Video) {
    setState((s) => ({ ...s, videos: { ...s.videos, [video.id]: video } }));
  }

  function addManyToLibrary(videos: Video[]) {
    setState((s) => {
      const next = { ...s.videos };
      for (const video of videos) {
        if (s.unplayableIds.includes(video.id)) continue;
        next[video.id] = next[video.id] ?? video;
      }
      return { ...s, videos: next };
    });
  }

  async function addByInput(input: string) {
    const id = parseVideoId(input);
    if (!id) throw new Error("動画IDまたは YouTube URL を入力してください。");
    addToLibrary(await fetchVideoById(id));
  }

  async function addChannel(input: string): Promise<string> {
    const { title, videos } = await fetchChannelUploads(input, stateRef.current.unplayableIds);
    const existing = new Set(Object.keys(stateRef.current.videos));
    const fresh = videos.filter((video) => !existing.has(video.id));
    addManyToLibrary(videos);
    if (videos.length === 0) return `${title} に、埋め込める公開動画がありませんでした。`;
    if (fresh.length === 0) return `${title} の動画はすでにライブラリに入っています。`;
    return `${title} から ${fresh.length} 本をライブラリに入れました。`;
  }

  function addToPlaylist(videoId: string) {
    setState((s) => {
      const current = activePlaylist(s);
      if (!current || current.videoIds.includes(videoId) || s.unplayableIds.includes(videoId)) return s;
      return {
        ...s,
        playlists: s.playlists.map((p) => (p.id === current.id ? { ...p, videoIds: [...p.videoIds, videoId] } : p)),
      };
    });
  }

  function removeFromLibrary(videoId: string) {
    if (stateRef.current.currentVideoId === videoId) setSessionActive(false);
    setState((s) => {
      const videos = { ...s.videos };
      delete videos[videoId];
      return {
        ...s,
        videos,
        playlists: s.playlists.map((p) => ({ ...p, videoIds: p.videoIds.filter((id) => id !== videoId) })),
        currentVideoId: s.currentVideoId === videoId ? null : s.currentVideoId,
      };
    });
  }

  function moveInPlaylist(index: number, direction: -1 | 1) {
    setState((s) => {
      const current = activePlaylist(s);
      if (!current) return s;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.videoIds.length) return s;
      const videoIds = [...current.videoIds];
      const a = videoIds[index];
      const b = videoIds[nextIndex];
      if (a === undefined || b === undefined) return s;
      videoIds[index] = b;
      videoIds[nextIndex] = a;
      return {
        ...s,
        playlists: s.playlists.map((p) => (p.id === current.id ? { ...p, videoIds } : p)),
      };
    });
  }

  function removeFromPlaylist(videoId: string) {
    if (stateRef.current.currentVideoId === videoId) setSessionActive(false);
    setState((s) => {
      const current = activePlaylist(s);
      if (!current) return s;
      return {
        ...s,
        playlists: s.playlists.map((p) =>
          p.id === current.id ? { ...p, videoIds: p.videoIds.filter((id) => id !== videoId) } : p,
        ),
        currentVideoId: s.currentVideoId === videoId ? null : s.currentVideoId,
      };
    });
  }

  function createPlaylist() {
    const id = crypto.randomUUID();
    setState((s) => ({
      ...s,
      playlists: [...s.playlists, { id, name: `List ${s.playlists.length + 1}`, videoIds: [] }],
      activePlaylistId: id,
    }));
  }

  function renamePlaylist(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      playlists: s.playlists.map((p) => (p.id === s.activePlaylistId ? { ...p, name: trimmed } : p)),
    }));
  }

  function deletePlaylist() {
    setState((s) => {
      const remaining = s.playlists.filter((p) => p.id !== s.activePlaylistId);
      if (remaining.length === 0) {
        const fresh = emptyState();
        return { ...s, playlists: fresh.playlists, activePlaylistId: fresh.activePlaylistId, currentVideoId: null };
      }
      return { ...s, playlists: remaining, activePlaylistId: remaining[0]?.id ?? null };
    });
    setSessionActive(false);
  }

  function changeMode(mode: PlayMode) {
    const list = activePlaylist(state);
    if (mode === "shuffle" && list) patchShuffle(shuffledCopy(list.videoIds));
    setState({ ...state, playMode: mode });
  }

  const libraryVideos = Object.values(state.videos);
  const playlistIds = new Set(playlist?.videoIds ?? []);

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="eyebrow">Paisley Park · private booth</p>
          <h1>Prince</h1>
        </div>
      </header>

      <ModeToggle
        value={state.playMode}
        autoplayNext={state.autoplayNext}
        onChange={changeMode}
        onAutoplayNextChange={(value) => setState((s) => ({ ...s, autoplayNext: value }))}
      />

      <div className="stage">
        <PlayerStage
          ref={playerRef}
          video={currentVideo}
          sessionActive={sessionActive}
          autoplayBlocked={autoplayBlocked}
          skipNotice={skipNotice}
          emptyHint="右で検索し、プレイリストへ入れてから再生開始。"
          onStart={() => start()}
          onPrev={() => advance("prev")}
          onNext={() => advance("next")}
          onEnded={() => advance("ended")}
          onError={(code) => {
            if (code === 153) return;
            const s = stateRef.current;
            const id = s.currentVideoId;
            if ((code === 101 || code === 150) && id) {
              const list = activePlaylist(s);
              const index = list?.videoIds.indexOf(id) ?? -1;
              const dropped = dropFromPlaylists(s, id);
              const remaining = activePlaylist(dropped)?.videoIds ?? [];
              const nextId = index >= 0 ? (remaining[index] ?? remaining[0] ?? null) : (remaining[0] ?? null);
              const next = { ...dropped, currentVideoId: nextId };
              stateRef.current = next;
              patchShuffle(shuffleRef.current.filter((videoId) => videoId !== id));
              setSkipNotice("埋め込みできない動画をプレイリストから外しました。");
              setState(next);
              errorStreakRef.current = 0;
              if (nextId) playerRef.current?.loadAndPlay(nextId);
              else setSessionActive(false);
              return;
            }
            advance("error");
          }}
          onPlaying={() => {
            setAutoplayBlocked(false);
            setSkipNotice(null);
          }}
          onAutoplayBlocked={() => setAutoplayBlocked(true)}
        />

        <aside className="desk">
          <SearchPanel
            libraryIds={new Set(Object.keys(state.videos))}
            onSearch={(query) => searchVideos(query, state.unplayableIds)}
            onAddByInput={addByInput}
            onAddChannel={addChannel}
            onAddToLibrary={addToLibrary}
          />
          <LibraryPanel
            videos={libraryVideos}
            playlistIds={playlistIds}
            unplayableIds={state.unplayableIds}
            onAddToPlaylist={addToPlaylist}
            onRemoveFromLibrary={removeFromLibrary}
          />
          <PlaylistPanel
            playlists={state.playlists}
            activePlaylistId={state.activePlaylistId}
            videos={state.videos}
            watchCounts={state.watchCounts}
            currentVideoId={state.currentVideoId}
            onSelectPlaylist={(id) => setState((s) => ({ ...s, activePlaylistId: id }))}
            onCreatePlaylist={createPlaylist}
            onRenamePlaylist={renamePlaylist}
            onDeletePlaylist={deletePlaylist}
            onMove={moveInPlaylist}
            onRemove={removeFromPlaylist}
            onPlay={(id) => start(id)}
          />
        </aside>
      </div>
    </div>
  );
}
