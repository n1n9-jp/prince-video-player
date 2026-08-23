import { useEffect, useRef, useState } from "react";
import { AddPanel } from "./components/AddPanel";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlayerStage, type PlayerHandle } from "./components/PlayerStage";
import { PlaylistPanel } from "./components/PlaylistPanel";
import { PlaylistTabs } from "./components/PlaylistTabs";
import { Topbar } from "./components/Topbar";
import { goToPage, pageFromHash, type Page } from "./page";
import { applyAutoTags, addManualSong, removeManualSong } from "./catalog/tagging";
import { nextVideo, previousVideo, shuffledCopy, startVideo } from "./playback/nextVideo";
import { hydrateState, localStore } from "./storage/localStore";
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
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);

  const stateRef = useRef(state);
  const shuffleRef = useRef(shuffleOrder);
  const errorStreakRef = useRef(0);
  const playerRef = useRef<PlayerHandle>(null);
  const readyRef = useRef(false);
  stateRef.current = state;
  shuffleRef.current = shuffleOrder;

  function commit(next: AppState) {
    stateRef.current = next;
    setState(next);
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
    localStore.save(state);
    if (localStore.isStarterShaped(state)) return;
    const timer = window.setTimeout(() => {
      void pushLibrary(state).then((result) => {
        if (result.ok || !result.kept) return;
        commit(hydrateState(result.kept));
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready, state]);

  useEffect(() => {
    let cancelled = false;

    async function readServer() {
      const loaded = await loadCanonicalLibrary(localStore.load());
      if (cancelled) return;
      const next = loaded.state
        ? hydrateState(loaded.state)
        : localStore.seedEmptyLibrary(emptyState());
      commit(next);
      readyRef.current = true;
      setReady(true);
      if (loaded.source === "migrated") {
        setLibraryNotice("ブラウザに残っていたライブラリをサーバーへ移しました。以降はサーバーのコピーだけを使います。");
      }
    }

    async function refreshFromServer() {
      if (!readyRef.current) return;
      const current = stateRef.current;
      if (!localStore.isStarterShaped(current)) await pushLibrary(current);
      const remote = await pullLibrary();
      if (cancelled || !remote) return;
      commit(hydrateState(remote));
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
    setState((s) => {
      const videos = { ...s.videos, [video.id]: video };
      return { ...s, videos, videoTags: applyAutoTags(videos, s.videoTags) };
    });
  }

  function addManyToLibrary(videos: Video[]) {
    setState((s) => {
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

  function movePlaylist(direction: -1 | 1) {
    setState((s) => {
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
    <div className="app">
      {!ready ? (
        <p className="library-loading" role="status">
          サーバーのライブラリを読み込んでいます…
        </p>
      ) : null}
      <div hidden={!ready}>
      {libraryNotice ? (
        <div className="restore-banner" role="status">
          <p>{libraryNotice}</p>
          <button type="button" className="btn-text" onClick={() => setLibraryNotice(null)}>
            閉じる
          </button>
        </div>
      ) : null}
      <Topbar busy={searchBusy} onSearch={runSearch} />

      <div className="watch-page" hidden={page !== "watch"}>
        <PlayerStage
          ref={playerRef}
          video={currentVideo}
          tagging={state.currentVideoId ? state.videoTags[state.currentVideoId] : undefined}
          sessionActive={sessionActive}
          autoplayBlocked={autoplayBlocked}
          skipNotice={skipNotice}
          emptyHint="追加ページでリストに入れると、ここで再生できます。"
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
        <PlaylistPanel
          playlists={state.playlists}
          activePlaylistId={state.activePlaylistId}
          videos={state.videos}
          watchCounts={state.watchCounts}
          currentVideoId={state.currentVideoId}
          autoplayNext={state.autoplayNext}
          playMode={state.playMode}
          onSelectPlaylist={(id) => setState((s) => ({ ...s, activePlaylistId: id }))}
          onCreatePlaylist={createPlaylist}
          onMovePlaylist={movePlaylist}
          onRenamePlaylist={renamePlaylist}
          onDeletePlaylist={deletePlaylist}
          onMove={moveInPlaylist}
          onRemove={removeFromPlaylist}
          onPlay={(id) => start(id)}
          onAutoplayNextChange={(value) => setState((s) => ({ ...s, autoplayNext: value }))}
          onPlayModeChange={changeMode}
        />
      </div>

      <div className="library-page" hidden={page !== "library"}>
        <div className="shelf add-target">
          <span>追加先</span>
          <PlaylistTabs
            playlists={state.playlists}
            activePlaylistId={state.activePlaylistId}
            onSelect={(id) => setState((s) => ({ ...s, activePlaylistId: id }))}
            onCreate={createPlaylist}
            onMove={movePlaylist}
          />
        </div>
        <AddPanel
          libraryIds={new Set(Object.keys(state.videos))}
          results={searchResults}
          searched={searched}
          searchError={searchError}
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
            setState((s) => ({
              ...s,
              videoTags: { ...s.videoTags, [videoId]: addManualSong(s.videoTags[videoId], songId) },
            }));
          }}
          onRemoveSongTag={(videoId, songId) => {
            setState((s) => {
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
