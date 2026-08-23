# 楽曲・セットリストの収集

Prince Lounge の曲名・アルバム・公演セットリストは、**実行時 API ではなくリポジトリ内の JSON** である。YouTube 動画そのもの（ライブラリ）とは別物で、ライブラリは Cloudflare KV、カタログは git に置く。

いまコミットされている規模の目安: 公式曲を中心に約 580 曲、リリース約 170、公演セットリストはスターター用に 5 本（うち 4 本に曲順あり）。公演を増やすときは overlays を足してビルドする。

## 全体の流れ

```
MusicBrainz (公式盤)
        │  npm run catalog:import
        ▼
scripts/.cache/mb-songs.json
scripts/.cache/mb-releases.json     ← git に入れない。再取得できる
        │
        │  npm run catalog:build  （overlays と合成）
        ▼
src/catalog/data/*.json             ← git に入れる。アプリが読む正本
        │
        │  ビルド時にバンドル
        ▼
タイトル照合 → videoTags（KV）
```

| 置き場 | 中身 | 残るか |
| --- | --- | --- |
| `src/catalog/overlays/` | 手で足す曲・別名・未発表・カバー・公演セットリスト | git。再取得しても消さない |
| `src/catalog/data/` | 合成結果。アプリが import する | git。`catalog:build` で上書き |
| `scripts/.cache/` | MusicBrainz の生データ | gitignore。消えても `catalog:import` で戻る |
| Worker KV `library` | YouTube 動画・プレイリスト・`videoTags` | デプロイでは消えない。カタログとは別 |

## コマンド

公式盤を MusicBrainz から取り直し、overlays を載せて `data/` を書き直す:

```
npm run catalog:import
```

中身は `node scripts/import-musicbrainz.mjs` のあと `node scripts/build-catalog.mjs`。MusicBrainz は 1 リクエストあたり約 1.1 秒空ける。初回は数分かかる。キャッシュがあれば import はキャッシュを使う。

キャッシュを使わず overlays だけ反映する:

```
npm run catalog:build
```

タイトル照合がスターター動画で壊れていないか:

```
npm test
```

（`scripts/test-match.ts` が `scripts/fixtures/title-match.json` と照合する。）

`data/` を書き換えたらコミットする。コミットしないと本番バンドルに乗らない。

## MusicBrainz（公式アルバム / シングル / EP）

`scripts/import-musicbrainz.mjs`:

- アーティスト MBID: `070d193a-845c-479f-980e-bef15710653e`
- `status=official` の album / single / ep
- Live・Remix・Demo などの secondary type は捨てる
- 同一 release-group は代表盤を 1 枚にする（US 盤寄り、deluxe / remaster は減点）
- 曲名から live/remix 括弧を落として正規化し、スラッグを `song.id` にする
- `kind` はすべて `official`

帰属: [MusicBrainz](https://musicbrainz.org/artist/070d193a-845c-479f-980e-bef15710653e)（[CC BY-NC-SA 3.0](https://musicbrainz.org/doc/MusicBrainz_Database/FAQ)）。ダンプの再配布条件は MusicBrainz に従う。このリポジトリが持つのはビルド済み JSON である。

## overlays（手作業）

`scripts/build-catalog.mjs` が MusicBrainz キャッシュの上に載せる。**ここが正。** MusicBrainz を再取得しても overlays は消えない。

| ファイル | 用途 |
| --- | --- |
| `overlays/songs.json` | 未発表・カバー・後年リリース。`kind` は `unreleased` / `cover` / `laterReleased`。出典 URL と confidence |
| `overlays/aliases.json` | 既存 `song.id` → 別名配列（`I Would Die For You` など） |
| `overlays/releases.json` | 公式盤に無いリリースを足す（空でもよい） |
| `overlays/concerts.json` | 公演。`songs` は曲名の配列。ビルド時に `song.id` へ解決して `data/concerts.json` の `setlist` になる |

公演の足し方:

1. [Prince Vault](https://princevault.com/) で日付ページを開き、曲名・会場・ツアー名を確認する
2. 記事本文はコピーしない。事実（日・会場・曲名）と `sourceUrl` だけ overlays に書く
3. 曲名がカタログに無ければ先に `overlays/songs.json` へ入れる
4. `npm run catalog:build`。未解決の曲名は stderr に出る
5. 必要なら `scripts/fixtures/title-match.json` に YouTube タイトルの期待タグを足して `npm test`

カバーや未発表も同じ。噂レベルの曲は入れない。`confidence: "low"` の曲は自動照合の針から外れる。

## アプリ側での使い方

実行時に MusicBrainz も Prince Vault も叩かない。`src/catalog/index.ts` が `data/*.json` を読み、別名を折りたたんだ針を作る。

`src/catalog/match.ts` の `tagTitle` が YouTube タイトルに針を当てる。公演名だけヒットした場合は、その公演のセットリスト全曲をタグ候補にする。

ライブラリへ動画を入れたとき `applyAutoTags` が走る。`source: "manual"` のタグは上書きしない。結果は KV の `videoTags` に保存される。カタログを更新したあとは、自動タグの動画だけが再照合される。

## やってはいけないこと

- `data/*.json` を手で大きく直して overlays に戻さない（次の build で消える）
- Prince Vault の記事本文をリポジトリに置く
- カタログ JSON を KV に「バックアップ」したつもりになる（KV は動画ライブラリ専用）
- 公式盤の抜けを overlays 無しで MusicBrainz 再取得だけに頼る（別名と未発表は overlays 側）
