# Agent notes

This is a personal Prince YouTube player. The owner works in Japanese. Do not invent export/import workflows. Do not claim a gitignored file was deleted just because this clone does not have it.

## Production facts

- Live: https://prince-tube.tokyo-air.workers.dev/ Worker name `prince-tube`
- Library canon is Cloudflare KV via `GET/PUT /api/library`, not `localStorage` and not the git tree
- Watch UI is `#/`. Edit UI (search, library, playlists) is `#/library`
- YouTube Data API is proxied by `GET /api/youtube/*`. The key is Worker secret `YOUTUBE_API_KEY`

## Never

- Never commit `.env.local` or `.dev.vars` or put API keys in source, `wrangler.jsonc` `vars`, or `VITE_*` during `vite build`
- Never pass `VITE_YOUTUBE_API_KEY` into the GitHub Actions build step
- Never use `cloudflare/wrangler-action` `secrets:` — it uploads secrets **before** deploy and fails with Cloudflare 10215 after a PR `versions upload`
- Never put `secrets.*` in a GitHub Actions `if:` — the workflow file is rejected
- Never PUT starter-shaped or sharply shrunken library state to `/api/library`
- Never tell the user to restore KV from git. Empty KV cannot be recovered from this repo. `library:prev` is only the previous successful overwrite
- Never assume this Cloud Agent environment has `.env.local`. The user's machine may still have it. Copying the YouTube key into GitHub Secrets is a human step

## YouTube key

- Production: GitHub Secret `YOUTUBE_API_KEY` → `npx wrangler secret bulk` **after** `wrangler deploy` on `main`
- Google Cloud: production key must **not** use HTTP-referrer / website restrictions (API restriction: YouTube Data API v3 only). Website restrictions block the Worker (`Requests from referer … are blocked`). `https://host/*` does not match `https://host/`
- Local `npm run dev` may use `.env.local` `VITE_YOUTUBE_API_KEY` with referrer `http://127.0.0.1:5173/*`

## Docs and checks

- Human runbook: `docs/operations.md`
- Guards: `scripts/check-guards.ts` (workflow + referer path), `scripts/check-bundle.ts` (no Google API keys in `dist`), `scripts/smoke-production.ts` (live Worker after production deploy)
