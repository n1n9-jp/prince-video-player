import { useState, type FormEvent } from "react";
import type { Page } from "../page";

type Props = {
  page: Page;
  busy: boolean;
  onSearch: (query: string) => Promise<void>;
};

export function Topbar({ page, busy, onSearch }: Props) {
  const [query, setQuery] = useState("Prince live");

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    await onSearch(query);
  }

  return (
    <header className="topbar">
      <a className="wordmark" href="#/" aria-label="PrinceTube">
        <span className="mark" aria-hidden="true">
          <svg viewBox="0 0 30 20" width="36" height="24">
            <rect width="30" height="20" rx="5.5" />
            <path d="M12.2 5.1v9.8L22.2 10z" />
          </svg>
        </span>
        <span className="wordmark-text">
          Prince<span>Tube</span>
        </span>
      </a>
      {page === "library" ? (
        <form className="yt-search" onSubmit={handleSearch}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="検索"
            aria-label="YouTube 検索"
          />
          <button type="submit" disabled={busy} aria-label="検索">
            {busy ? (
              "…"
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M17.7 16.3 21 19.6l-1.4 1.4-3.3-3.3A7.9 7.9 0 1 1 18 10a7.9 7.9 0 0 1-.3 6.3ZM10 16.5A6.5 6.5 0 1 0 10 3.5a6.5 6.5 0 0 0 0 13Z"
                />
              </svg>
            )}
          </button>
        </form>
      ) : (
        <span />
      )}
      {page === "watch" ? (
        <a className="edit-link" href="#/library">
          編集
        </a>
      ) : (
        <span className="topbar-end" aria-hidden="true" />
      )}
    </header>
  );
}
