import { useState, type FormEvent } from "react";
import type { Video } from "../storage/types";
import { hasApiKey } from "../youtube/dataApi";

type Props = {
  libraryIds: Set<string>;
  onSearch: (query: string) => Promise<Video[]>;
  onAddByInput: (input: string) => Promise<void>;
  onAddChannel: (input: string) => Promise<string>;
  onAddToLibrary: (video: Video) => void;
};

export function SearchPanel({ libraryIds, onSearch, onAddByInput, onAddChannel, onAddToLibrary }: Props) {
  const [query, setQuery] = useState("Prince live");
  const [idInput, setIdInput] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [results, setResults] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"search" | "id" | "channel" | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setBusy("search");
    setError(null);
    setNotice(null);
    try {
      setResults(await onSearch(query));
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddId(event: FormEvent) {
    event.preventDefault();
    setBusy("id");
    setError(null);
    setNotice(null);
    try {
      await onAddByInput(idInput);
      setIdInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddChannel(event: FormEvent) {
    event.preventDefault();
    setBusy("channel");
    setError(null);
    setNotice(null);
    try {
      setNotice(await onAddChannel(channelInput));
      setChannelInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "チャンネルの追加に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>探す</h2>
        {!hasApiKey() && <p className="warn">APIキー未設定。ID追加は使えます。</p>}
      </header>
      <form className="row-form" onSubmit={handleSearch}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Prince live"
          aria-label="検索語"
        />
        <button type="submit" className="btn-gold" disabled={busy !== null}>
          {busy === "search" ? "確認中…" : "検索"}
        </button>
      </form>
      <form className="row-form quiet" onSubmit={handleAddId}>
        <input
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          placeholder="動画ID / URL"
          aria-label="動画IDまたはURL"
        />
        <button type="submit" className="btn-ghost" disabled={busy !== null}>
          追加
        </button>
      </form>
      <form className="row-form quiet" onSubmit={handleAddChannel}>
        <input
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          placeholder="@handle / チャンネルURL"
          aria-label="チャンネルURLまたはハンドル"
        />
        <button type="submit" className="btn-ghost" disabled={busy !== null}>
          {busy === "channel" ? "取得中…" : "全件"}
        </button>
      </form>
      {error && <p className="warn">{error}</p>}
      {notice && <p className="empty">{notice}</p>}
      {results.length > 0 ? (
        <ul className="video-list">
          {results.map((video) => {
            const saved = libraryIds.has(video.id);
            return (
              <li key={video.id}>
                <img src={video.thumbnailUrl} alt="" />
                <div>
                  <strong>{video.title}</strong>
                  <span>{video.channelTitle}</span>
                </div>
                <button type="button" className="btn-ghost" disabled={saved} onClick={() => onAddToLibrary(video)}>
                  {saved ? "済" : "入れる"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : !error && !notice ? (
        <p className="empty">
          {searched
            ? "このページに埋め込める動画がありません。公式MVや Topic の音源は YouTube が埋め込みを禁止しています。ライブ映像を試してください。"
            : "Prince live などで検索するか、チャンネルを指定するとライブラリに入れられます。"}
        </p>
      ) : null}
    </section>
  );
}
