export type Page = "watch" | "library";

export function pageFromHash(): Page {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return raw === "library" ? "library" : "watch";
}

export function goToPage(page: Page) {
  const next = page === "library" ? "#/library" : "#/";
  if (pageFromHash() === page) return;
  window.location.hash = next;
}
