# Prince Lounge

Prince の YouTube 動画を、このページ側のプレイリスト・視聴順・視聴回数で連続再生する個人用ページです。埋め込み再生は YouTube の IFrame Player を使いますが、おすすめ順や関連動画には従いません。

## 準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作り、**YouTube Data API v3** を有効にする。
2. 認証情報から API キーを発行する。
3. キーの制限:
   - API の制限: YouTube Data API v3 のみ
   - ウェブサイトの制限: `http://127.0.0.1:5173/*`
4. リポジトリ直下に `.env.local` を作り、`.env.example` を参考にキーを書く。

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

プレイリストと視聴回数は `localStorage` に保存されます。
