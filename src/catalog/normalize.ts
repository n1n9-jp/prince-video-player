export function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function foldTitle(input: string): string {
  return decodeEntities(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/☮/g, "o")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(title: string): string {
  return foldTitle(title).replace(/ /g, "-");
}

export function tokenAlternates(token: string): string[] {
  if (token === "4") return ["4", "for"];
  if (token === "2") return ["2", "to", "too"];
  if (token === "u") return ["u", "you"];
  if (token === "o") return ["o", "of"];
  if (token === "ur") return ["ur", "your"];
  return [token];
}

export function expandFolded(folded: string): string[] {
  const tokens = folded.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  let variants = [""];
  for (const token of tokens) {
    const alts = tokenAlternates(token);
    const next: string[] = [];
    for (const prefix of variants) {
      for (const alt of alts) {
        next.push(prefix ? `${prefix} ${alt}` : alt);
        if (next.length > 32) break;
      }
      if (next.length > 32) break;
    }
    variants = next;
  }
  return [...new Set(variants)];
}

export function isStrictNeedle(folded: string): boolean {
  if (folded.length <= 3) return true;
  if (/^\d+$/.test(folded)) return true;
  return folded.split(" ").every((part) => part.length <= 2);
}
