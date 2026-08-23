# Prince Lounge

Prince の YouTube 動画を、このページ側のプレイリスト・視聴順・視聴回数で連続再生する個人用ページです。埋め込み再生は YouTube の IFrame Player を使いますが、おすすめ順や関連動画には従いません。

## 準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作り、**YouTube Data API v3** を有効にする。
2. 認証情報から API キーを発行する。
3. キーの制限:
    - API の制限: YouTube Data API v3 のみ
    - ウェブサイトの制限: `http://127.0.0.1:5173/*` と `https://prince-tube.tokyo-air.workers.dev/*`
4. リポジトリ直下に `.env.local` を作り、`.env.example` を参考にキーを書く。 Cloudflare の本番ビルドでは、Workers Builds の環境変数に同じ `VITE_YOUTUBE_API_KEY` を入れる。

```
VITE_YOUTUBE_API_KEY=your_key_here
```

検索は 1 日 100 回までです。同じ検索語はブラウザにキャッシュし、リロードでは再検索しません。

## 起動

```
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:5173` を開く。

## 使い方

1. Prince などで検索し、ヒットをライブラリへ入れる。動画 ID や URL の直接追加もできる。
2. プレイリストへ入れて並べ替える。
3. 再生モード（順再生 / シャッフル / 視聴回数の少ない順）を選び、「再生開始」を押す。
4. 最後まで見た動画だけ、このページの視聴回数が 1 増える。
5. ライブラリ追加時に、タイトルから曲・アルバム・公演を自動タグ付けする。ライブラリでは曲名・公式/ライブ/未発表/カバーで絞れる。タグは手で足したり外したりできる。

プレイリスト、視聴回数、タグは `localStorage` に保存されます。

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

本番は Cloudflare Workers の静的アセットです。Worker 名は `prince-tube`、公開 URL は [https://prince-tube.tokyo-air.workers.dev/](https://prince-tube.tokyo-air.workers.dev/) です。設定は [`wrangler.jsonc`](wrangler.jsonc) にあります。

`main` への push は GitHub Actions（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）がビルドしてデプロイします。PR ではプレビュー版を upload します。

必要な GitHub Secrets:

1. Cloudflare で [API トークン](https://dash.cloudflare.com/profile/api-tokens) を作る（テンプレート **Edit Cloudflare Workers**）
2. リポジトリ **Settings → Secrets and variables → Actions** に入れる
    - `CLOUDFLARE_API_TOKEN`（必須）
    - `CLOUDFLARE_ACCOUNT_ID`（ダッシュボード右サイドバーの Account ID）
    - `VITE_YOUTUBE_API_KEY`（任意。検索を本番でも使う場合）

手元から出す場合:

```
npm run deploy
```

