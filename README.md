# Prince Lounge

Prince の YouTube 動画を、このページ側のプレイリスト・視聴順・視聴回数で連続再生する個人用ページです。埋め込み再生は YouTube の IFrame Player を使いますが、おすすめ順や関連動画には従いません。

## 準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作り、**YouTube Data API v3** を有効にする。
2. 認証情報から API キーを発行する。
3. キーの制限:
    - API の制限: YouTube Data API v3 のみ
    - ウェブサイトの制限: `http://127.0.0.1:5173/*` と `https://prince-tube.tokyo-air.workers.dev/*`
4. ローカル検索だけなら、リポジトリ直下に `.env.local` を作り、`.env.example` を参考にキーを書く。このファイルは git に入らないし、本番の JS にも入らない。

```
VITE_YOUTUBE_API_KEY=your_key_here
```

本番の検索はフロントにキーを埋め込まない。Worker が `/api/youtube/*` で YouTube Data API を代理し、秘密変数 `YOUTUBE_API_KEY` を付ける。GitHub Secrets に同じ名前で `.env.local` のキーを入れれば、`main` へのデプロイ時に Cloudflare へ載る。手元から出す場合は `npx wrangler secret put YOUTUBE_API_KEY`。`wrangler dev` なら `.dev.vars`（`.dev.vars.example` 参照）。

Worker は Google へ `Referer: https://prince-tube.tokyo-air.workers.dev/` を付ける。キーのウェブサイト制限にこの URL が入っていること。

検索は 1 日 100 回までです。同じ検索語はブラウザにキャッシュし、リロードでは再検索しません。

## 起動

```
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:5173` を開く。

## 使い方

閲覧は [`#/`](https://prince-tube.tokyo-air.workers.dev/#/)、編集は [`#/library`](https://prince-tube.tokyo-air.workers.dev/#/library) です。

1. 編集ページで Prince などを検索し、ヒットをライブラリへ入れる。動画 ID や URL の直接追加もできる。
2. ライブラリからプレイリストへ入れ、並べ替える。プレイリストの作成・改名・削除も編集ページで行う。
3. 閲覧ページで再生モード（順再生 / シャッフル / 視聴回数の少ない順）を選び、「再生開始」を押す。
4. 最後まで見た動画だけ、このページの視聴回数が 1 増える。
5. ライブラリ追加時に、タイトルから曲・アルバム・公演を自動タグ付けする。ライブラリでは曲名・公式/ライブ/未発表/カバーで絞れる。タグは手で足したり外したりできる。

プレイリスト、視聴回数、タグはサーバー（Cloudflare KV）に一つだけあります。ローカルで開いても本番で開いても、同じ `https://prince-tube.tokyo-air.workers.dev/api/library` を読み書きします。ブラウザへの書き出しや読み込みは不要です。

## 楽曲カタログ

動画タグはリポジトリ内の静的カタログ（`src/catalog/data/`）を使います。実行時に外部 API は呼びません。

- 公式アルバム / シングルの収録曲: [MusicBrainz](https://musicbrainz.org/artist/070d193a-845c-479f-980e-bef15710653e)（[CC BY-NC-SA 3.0](https://musicbrainz.org/doc/MusicBrainz_Database/FAQ)）
- 未発表曲・公演の日付や会場: [Prince Vault](https://princevault.com/) などの公開事実。記事本文は収録していない
- 手修正の別名・未発表・セットリスト: `src/catalog/overlays/`

カタログを作り直す:

```
npm run catalog:import
```

MusicBrainz の再取得をせず overlays だけ反映する:

```
npm run catalog:build
```

タイトル照合の回帰:

```
npm test
```

## Cloudflare

本番は Cloudflare Workers です。Worker 名は `prince-tube`、公開 URL は [https://prince-tube.tokyo-air.workers.dev/](https://prince-tube.tokyo-air.workers.dev/) です。静的アセットに加え、ライブラリ用の KV を `/api/library` で読み書きし、YouTube 検索は `/api/youtube/*` がキーを付けて代理します。設定は [`wrangler.jsonc`](wrangler.jsonc) にあります。

`main` への push は GitHub Actions（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）がビルドしてデプロイします。PR ではプレビュー版を upload します。

必要な GitHub Secrets:

1. Cloudflare で [API トークン](https://dash.cloudflare.com/profile/api-tokens) を作る（テンプレート **Edit Cloudflare Workers**。KV を自動作成するため **Workers KV Storage Edit** も付ける）
2. リポジトリ **Settings → Secrets and variables → Actions** に入れる
    - `CLOUDFLARE_API_TOKEN`（必須）
    - `CLOUDFLARE_ACCOUNT_ID`（ダッシュボード右サイドバーの Account ID）
    - `YOUTUBE_API_KEY`（検索用。`.env.local` のキーをコピー。フロントの JS には出さない）
    - `VITE_YOUTUBE_API_KEY`（後方互換。`YOUTUBE_API_KEY` が空のときだけ Worker secret に使う。新規は前者）

手元から出す場合:

```
npm run deploy
```

