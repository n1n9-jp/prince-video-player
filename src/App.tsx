import { useEffect, useRef, useState } from "react";
import { AddPanel } from "./components/AddPanel";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlayerStage, type PlayerHandle } from "./components/PlayerStage";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { Topbar } from "./components/Topbar";
import { WatchTagList } from "./components/WatchTagList";
import { goToPage, pageFromHash, type Page } from "./page";
import { applyAutoTags, addManualSong, removeManualSong } from "./catalog/tagging";
import { nextVideo, previousVideo, shuffledCopy, startVideo } from "./playback/nextVideo";
import { hydrateState } from "./storage/localStore";
import { isStarterShaped } from "./storage/parse";
import { loadCanonicalLibrary, pullLibrary, pushLibrary } from "./storage/remoteStore";
import { activePlaylist, dropFromPlaylists, emptyState, type AppState, type PlayMode, type Video } from "./storage/types";
import { fetchChannelUploads, fetchVideoById, parseVideoId, searchVideos } from "./youtube/dataApi";
import { loadYoutubeApi } from "./youtube/iframePlayer";

export function App() {
  const [state, setState] = useState<AppState>(() => emptyState());
  const [shuffleOrder, setShuffleOrder] = useState<string[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [skipNotice, setSkipNotice] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [ready, setReady] = useState(false);

  const stateRef = useRef(state);
  const shuffleRef = useRef(shuffleOrder);
  const errorStreakRef = useRef(0);
  const playerRef = useRef<PlayerHandle>(null);
  const readyRef = useRef(false);
  stateRef.current = state;
  shuffleRef.current = shuffleOrder;

  function catalogChanged(prev: AppState, next: AppState): boolean {
    return (
      next.videos !== prev.videos ||
      next.playlists !== prev.playlists ||
      next.unplayableIds !== prev.unplayableIds ||
      next.videoTags !== prev.videoTags
    );
  }

  function withRev(prev: AppState, next: AppState): AppState {
    if (next === prev) return prev;
    return catalogChanged(prev, next) ? { ...next, dataRev: (prev.dataRev ?? 0) + 1 } : next;
  }

  function replace(next: AppState) {
    stateRef.current = next;
    setState(next);
  }

  function commit(next: AppState) {
    replace(withRev(stateRef.current, next));
  }

  function patch(fn: (s: AppState) => AppState) {
    setState((s) => {
      const next = fn(s);
      if (next === s) return s;
      const bumped = withRev(s, next);
      stateRef.current = bumped;
      return bumped;
    });
  }

  useEffect(() => {
    void loadYoutubeApi();
  }, []);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (isStarterShaped(state)) return;
    const timer = window.setTimeout(() => {
      void pushLibrary(stateRef.current).then((result) => {
        if (result.ok || !result.kept) return;
        replace(hydrateState(result.kept));
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready, state]);

  useEffect(() => {
    if (!ready) return;
    function flush() {
      const current = stateRef.current;
      if (isStarterShaped(current)) return;
      void pushLibrary(current);
    }
    function onHide() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    window.addEventListener("hashchange", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("hashchange", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    async function readServer() {
      const loaded = await loadCanonicalLibrary(null);
      if (cancelled) return;
      const next = loaded.state ? hydrateState(loaded.state) : hydrateState(emptyState());
      replace(next);
      readyRef.current = true;
      setReady(true);
    }

    async function refreshFromServer() {
      if (!readyRef.current) return;
      const current = stateRef.current;
      if (!isStarterShaped(current)) await pushLibrary(current);
      const remote = await pullLibrary();
      if (cancelled || !remote) return;
      replace(hydrateState(remote));
    }

    void readServer();
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void refreshFromServer();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  useEffect(() => {
    const list = activePlaylist(state);
    const first = list?.videoIds[0];
    if (state.currentVideoId || !first) return;
    patch((s) => (s.currentVideoId ? s : { ...s, currentVideoId: first }));
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
    commit({ ...s, currentVideoId: result.videoId });
    setAutoplayBlocked(false);
    setSessionActive(Boolean(result.videoId));
    if (result.videoId) playerRef.current?.loadAndPlay(result.videoId);
  }

  function ingestAndPlay(video: Video) {
    const s = stateRef.current;
    const videos = { ...s.videos, [video.id]: video };
    const current = activePlaylist(s);
    let playlists = s.playlists;
    if (current && !current.videoIds.includes(video.id) && !s.unplayableIds.includes(video.id)) {
      playlists = s.playlists.map((p) =>
        p.id === current.id ? { ...p, videoIds: [...p.videoIds, video.id] } : p,
      );
    }
    commit({ ...s, videos, playlists, videoTags: applyAutoTags(videos, s.videoTags) });
    goToPage("watch");
    start(video.id);
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
      commit({ ...s, watchCounts });
      setSessionActive(false);
      return;
    }
    const input = { ...playbackInput(s), watchCounts };
    const result = kind === "prev" ? previousVideo(input) : nextVideo(input);
    patchShuffle(result.shuffleOrder);
    commit({ ...s, watchCounts, currentVideoId: result.videoId });
    if (!result.videoId) setSessionActive(false);
    else playerRef.current?.loadAndPlay(result.videoId);
  }

  function addToLibrary(video: Video) {
    patch((s) => {
      const videos = { ...s.videos, [video.id]: video };
      return { ...s, videos, videoTags: applyAutoTags(videos, s.videoTags) };
    });
  }

  function addManyToLibrary(videos: Video[]) {
    patch((s) => {
      const next = { ...s.videos };
      for (const video of videos) {
        if (s.unplayableIds.includes(video.id)) continue;
        next[video.id] = next[video.id] ?? video;
      }
      return { ...s, videos: next, videoTags: applyAutoTags(next, s.videoTags) };
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

  async function runSearch(query: string) {
    goToPage("library");
    setSearchBusy(true);
    setSearchError(null);
    try {
      setSearchResults(await searchVideos(query, stateRef.current.unplayableIds));
      setSearched(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setSearchBusy(false);
    }
  }

  function addToPlaylist(videoId: string) {
    patch((s) => {
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
    patch((s) => {
      const videos = { ...s.videos };
      delete videos[videoId];
      const videoTags = { ...s.videoTags };
      delete videoTags[videoId];
      return {
        ...s,
        videos,
        videoTags,
        playlists: s.playlists.map((p) => ({ ...p, videoIds: p.videoIds.filter((id) => id !== videoId) })),
        currentVideoId: s.currentVideoId === videoId ? null : s.currentVideoId,
      };
    });
  }

  function moveInPlaylist(index: number, direction: -1 | 1) {
    patch((s) => {
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
    patch((s) => {
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

  function movePlaylist(direction: -1 | 1) {
    patch((s) => {
      const index = s.playlists.findIndex((p) => p.id === s.activePlaylistId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= s.playlists.length) return s;
      const playlists = [...s.playlists];
      const a = playlists[index];
      const b = playlists[nextIndex];
      if (a === undefined || b === undefined) return s;
      playlists[index] = b;
      playlists[nextIndex] = a;
      return { ...s, playlists };
    });
  }

  function createPlaylist() {
    const id = crypto.randomUUID();
    patch((s) => ({
      ...s,
      playlists: [...s.playlists, { id, name: `List ${s.playlists.length + 1}`, videoIds: [] }],
      activePlaylistId: id,
    }));
  }

  function renamePlaylist(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    patch((s) => ({
      ...s,
      playlists: s.playlists.map((p) => (p.id === s.activePlaylistId ? { ...p, name: trimmed } : p)),
    }));
  }

  function deletePlaylist() {
    patch((s) => {
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
    <div className="app">
      {!ready ? (
        <p className="library-loading" role="status">
          サーバーのライブラリを読み込んでいます…
        </p>
      ) : null}
      <div hidden={!ready}>
      <Topbar page={page} />

      <div className="watch-page" hidden={page !== "watch"}>
        {page === "watch" ? (
        <PlayerStage
          ref={playerRef}
          video={currentVideo}
          tagging={state.currentVideoId ? state.videoTags[state.currentVideoId] : undefined}
          sessionActive={sessionActive}
          autoplayBlocked={autoplayBlocked}
          skipNotice={skipNotice}
          emptyHint="編集ページでリストに入れると、ここで再生できます。"
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
              setSkipNotice("埋め込みできない動画をプレイリストから削除しました。");
              commit(next);
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
        ) : null}
        <PlaylistPanel
          variant="watch"
          playlists={state.playlists}
          activePlaylistId={state.activePlaylistId}
          videos={state.videos}
          watchCounts={state.watchCounts}
          currentVideoId={state.currentVideoId}
          autoplayNext={state.autoplayNext}
          playMode={state.playMode}
          onSelectPlaylist={(id) => patch((s) => ({ ...s, activePlaylistId: id }))}
          onPlay={(id) => start(id)}
          onAutoplayNextChange={(value) => patch((s) => ({ ...s, autoplayNext: value }))}
          onPlayModeChange={changeMode}
        />
        <WatchTagList videoIds={playlist?.videoIds ?? []} videoTags={state.videoTags} />
      </div>

      <div className="library-page" hidden={page !== "library"}>
        <PlaylistPanel
          variant="edit"
          playlists={state.playlists}
          activePlaylistId={state.activePlaylistId}
          videos={state.videos}
          watchCounts={state.watchCounts}
          currentVideoId={state.currentVideoId}
          onSelectPlaylist={(id) => patch((s) => ({ ...s, activePlaylistId: id }))}
          onCreatePlaylist={createPlaylist}
          onMovePlaylist={movePlaylist}
          onRenamePlaylist={renamePlaylist}
          onDeletePlaylist={deletePlaylist}
          onMove={moveInPlaylist}
          onRemove={removeFromPlaylist}
          onPlay={(id) => {
            goToPage("watch");
            start(id);
          }}
        />
        <AddPanel
          libraryIds={new Set(Object.keys(state.videos))}
          results={searchResults}
          searched={searched}
          searchError={searchError}
          searchBusy={searchBusy}
          onSearch={runSearch}
          onAddByInput={addByInput}
          onAddChannel={addChannel}
          onAddToLibrary={addToLibrary}
          onPlay={ingestAndPlay}
        />
        <LibraryPanel
          videos={libraryVideos}
          playlistIds={playlistIds}
          unplayableIds={state.unplayableIds}
          watchCounts={state.watchCounts}
          videoTags={state.videoTags}
          onPlay={ingestAndPlay}
          onAddToPlaylist={addToPlaylist}
          onRemoveFromLibrary={removeFromLibrary}
          onAddSongTag={(videoId, songId) => {
            patch((s) => ({
              ...s,
              videoTags: { ...s.videoTags, [videoId]: addManualSong(s.videoTags[videoId], songId) },
            }));
          }}
          onRemoveSongTag={(videoId, songId) => {
            patch((s) => {
              const next = removeManualSong(s.videoTags[videoId], songId);
              const videoTags = { ...s.videoTags };
              if (next) videoTags[videoId] = next;
              else delete videoTags[videoId];
              return { ...s, videoTags };
            });
          }}
        />
      </div>
      </div>
    </div>
  );
}
