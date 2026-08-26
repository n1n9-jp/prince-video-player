import { hashForPage, type Page } from "../page";

type Props = {
  page: Page;
};

const links: { page: Page; label: string }[] = [
  { page: "browse", label: "一覧" },
  { page: "watch", label: "詳細" },
  { page: "library", label: "編集" },
];

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
      <nav className="page-nav" aria-label="ページ">
        {links.map((link) => (
          <a key={link.page} href={hashForPage(link.page)} aria-current={page === link.page ? "page" : undefined}>
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
