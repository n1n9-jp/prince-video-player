export type Page = "browse" | "watch" | "library";

export function pageFromHash(): Page {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  if (raw === "library") return "library";
  if (raw === "watch") return "watch";
  return "browse";
}

export function hashForPage(page: Page): string {
  if (page === "library") return "#/library";
  if (page === "watch") return "#/watch";
  return "#/";
}

export function goToPage(page: Page) {
  if (pageFromHash() === page) return;
  window.location.hash = hashForPage(page);
}
