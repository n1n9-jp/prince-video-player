import type { Page } from "../page";

type Props = {
  page: Page;
};

export function Topbar({ page }: Props) {
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
        <nav className="page-nav" aria-label="ページ">
          <a href="#/">閲覧</a>
        </nav>
      ) : (
        <span className="topbar-end" aria-hidden="true" />
      )}
    </header>
  );
}
