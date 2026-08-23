import { useEffect, useState, type FormEvent } from "react";
import type { Video } from "../storage/types";
import { youtubeConfigured } from "../youtube/dataApi";
import { VideoCard } from "./VideoCard";

type Props = {
  libraryIds: Set<string>;
  results: Video[];
  searched: boolean;
  searchError: string | null;
  searchBusy: boolean;
  onSearch: (query: string) => Promise<void>;
  onAddByInput: (input: string) => Promise<void>;
  onAddChannel: (input: string) => Promise<string>;
  onAddToLibrary: (video: Video) => void;
  onPlay: (video: Video) => void;
};

export function AddPanel({
  libraryIds,
  results,
  searched,
  searchError,
  searchBusy,
  onSearch,
  onAddByInput,
  onAddChannel,
  onAddToLibrary,
  onPlay,
}: Props) {
  const [query, setQuery] = useState("Prince live");
  const [idInput, setIdInput] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState<boolean | null>(null);

  useEffect(() => {
    void youtubeConfigured().then(setYoutubeReady);
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await onSearch(query);
  }

  async function handleAddId(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onAddByInput(idInput);
      setIdInput("");
      setNotice("ライブラリに追加しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddChannel(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await onAddChannel(channelInput));
      setChannelInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "チャンネルの追加に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>YouTube から探す</h2>
        {youtubeReady === false && (
          <p className="warn">YouTube検索キー未設定。ID追加は使えます。</p>
        )}
      </header>
      <form className="yt-search in-panel" onSubmit={handleSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="検索"
          aria-label="YouTube 検索"
        />
        <button type="submit" disabled={searchBusy} aria-label="検索">
          {searchBusy ? "…" : "検索"}
        </button>
      </form>
      <div className="add-row">
        <form className="row-form" onSubmit={handleAddId}>
          <input
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            placeholder="動画ID / URL"
            aria-label="動画IDまたはURL"
          />
          <button type="submit" className="btn-ghost" disabled={busy}>
            追加
          </button>
        </form>
        <form className="row-form" onSubmit={handleAddChannel}>
          <input
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            placeholder="@handle / チャンネルURL"
            aria-label="チャンネルURLまたはハンドル"
          />
          <button type="submit" className="btn-ghost" disabled={busy}>
            {busy ? "取得中…" : "チャンネル全件"}
          </button>
        </form>
      </div>
      {(error || searchError) && <p className="warn">{error ?? searchError}</p>}
      {notice && <p className="empty">{notice}</p>}
      {results.length > 0 ? (
        <div className="video-grid">
          {results.map((video) => {
            const saved = libraryIds.has(video.id);
            return (
              <VideoCard
                key={video.id}
                video={video}
                onOpen={() => onPlay(video)}
                actions={
                  <button type="button" className="btn-text" disabled={saved} onClick={() => onAddToLibrary(video)}>
                    {saved ? "保存済" : "ライブラリへ"}
                  </button>
                }
              />
            );
          })}
        </div>
      ) : searched && !error && !searchError && !notice ? (
        <p className="empty">
          埋め込める動画がありません。公式MVや Topic の音源は YouTube が埋め込みを禁止していることが多いです。
        </p>
      ) : null}
    </section>
  );
}
