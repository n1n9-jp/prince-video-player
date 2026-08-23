# 運用メモ

Prince Lounge の本番は Cloudflare Worker `prince-tube`（[https://prince-tube.tokyo-air.workers.dev/](https://prince-tube.tokyo-air.workers.dev/)）。このファイルは、実際に壊したあとで書いた再発防止である。

## やってはいけないこと

1. **YouTube の API キーを `VITE_*` で本番ビルドに渡す。** `VITE_` はクライアント JS に入る。検索は Worker の `/api/youtube/*` が秘密変数 `YOUTUBE_API_KEY` を付ける。
2. **`cloudflare/wrangler-action` の `secrets:` 入力を使う。** この入力は **デプロイより前** に `secret bulk` する。PR の `versions upload` が未デプロイの最新版を残すと Cloudflare 10215 で落ちる。`main` では `wrangler deploy` の**あと**に `npx wrangler secret bulk` する。
3. **GitHub Actions の `if:` に `secrets.*` を書く。** ワークフローファイルごと無効になり、ジョブは 0 秒で失敗する。空かどうかはステップ内の `if [ -z "$YOUTUBE_API_KEY" ]` で見る。
4. **本番キーにウェブサイト（HTTP リファラ）制限を付ける。** キーはブラウザに無い。制限があると `Requests from referer https://prince-tube.tokyo-air.workers.dev/ are blocked` になる。`https://host/*` はオリジン直下の `/` にマッチしないことが多い。本番は **アプリケーション制限なし + API 制限 YouTube Data API v3 のみ**。ローカルの `.env.local` だけ `http://127.0.0.1:5173/*` でよい。
5. **`.env.local` を git に入れる / 消えたとクラウド側で決めつける。** gitignore 済み。clone や Cloud Agent には最初から無い。手元のファイルはリポジトリ操作では消えない。復旧は git からはできない。
6. **スターターデータや空に近いライブラリをサーバーへ PUT する。** 正本は KV。空の KV はデプロイでは埋まらない。一度空だと、ブラウザの初期データはアップロードされない。バックアップは KV の `library:prev`（直前の成功した上書きだけ）で、それより古いものは無い。

## GitHub Secrets

| 名前 | 用途 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | デプロイ。Workers + KV 編集 |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント |
| `YOUTUBE_API_KEY` | Worker 秘密変数。`.env.local` と同じ値をコピー。フロントには出さない |
| `VITE_YOUTUBE_API_KEY` | 後方互換。新規は使わない |

## 手元

- 開発: `.env.local` に `VITE_YOUTUBE_API_KEY=`（Vite の dev だけが読む）
- Worker を手元で動かす: `.dev.vars` に `YOUTUBE_API_KEY=`
- `npm run build` / `npm run deploy` はクライアントにキーを焼き込まない

## ライブラリ（KV）

- バインディング `LIBRARY`、キー `library`。正本は `/api/library`
- デプロイはコードとアセットだけ。KV は消えない。Worker 名を変える・KV を作り直す・`force=1` で縮小 PUT すると消える
- GET が 404 `{"error":"empty"}` ならサーバーに正本が無い。スターターでは埋めない
- 直前コピー: `library:prev`（上書きが成功したときだけ）

```
npx wrangler kv key get library --binding LIBRARY
npx wrangler kv key get library:prev --binding LIBRARY
```

## 画面

- 閲覧 `#/` — 再生だけ
- 編集 `#/library` — 検索・追加・プレイリスト編集

## デプロイ後に確認する

本番 `main` の Actions は `scripts/smoke-production.ts` を走らせる。手元なら:

```
npx tsx scripts/smoke-production.ts
```

- `GET /api/youtube/status` が `{ "configured": true }`
- `GET /api/youtube/videos?part=id&id=Zi9nlmMA12Y` が 200（リファラ制限の検知）
- `GET /api/library` が 200 で、動画がスターターより多い
