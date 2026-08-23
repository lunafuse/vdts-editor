# VDTS 形式 v0.1（versioned Digital Time Sheet）

VDTS はアニメーション用タイムシートの**正本**形式。現在の状態と、受け渡しごとの版（履歴）、修正指示・申し送り、手書きの線、受け取った原本を1ファイルに持つ。XDTS / TDTS はここからの派生出力として書き出す。

## ファイル

- 拡張子 **`.vdts.html`**、UTF-8。中身は**絵入りの HTML**: ダブルクリックでブラウザが開き、JavaScript 無しでシート（SVG）・上段・メモ欄（文字と手書き）・修正指示・申し送り・版の一覧が見える。データ本体は末尾の `<script type="application/vdts+json" id="vdts">…</script>` に JSON で入っている（`<` は `\u003c` にエスケープ）
- 絵は保存のたびに描き直される「閲覧用の描画」で、正本はデータの方。絵だけを切り出して回さないこと（上の帯にそう書いてある）
- 読む側は次の3つをどれも受け付ける: この HTML 容器／旧形式（1行目 `versionedDigitalTimeSheet Save Data`、2行目以降 JSON、拡張子 `.vdts`）／素の JSON。書くのは HTML 容器だけ

## 構造

```json
{
  "format": "vdts",
  "version": "0.1",
  "cut": { "title": "", "episode": "", "scene": "", "cut": "", "author": "", "memo": "", "memoHeight": 150, "fps": 24 },
  "sheet": {
    "duration": 48, "slackHead": 0, "slack": 0,
    "layers":   [ { "name": "A", "cells": ["1","1","1","SYMBOL_TICK_1","1","2", "…"] } ],
    "douga":    [ { "name": "A", "cells": ["1","1","1","2","2","3", "…"] } ],
    "dialogue": [ { "from": 1, "to": 24, "speaker": "太郎", "kind": "", "text": "おはよう", "lane": 0 } ],
    "camera":   [ { "from": 1, "to": 48, "kind": "PAN", "fromLabel": "A", "toLabel": "B", "text": "", "lane": 0 } ],
    "ink":      [ { "id": "k1", "zone": "memo", "color": "shu", "width": "thin", "who": "", "role": "", "at": "…", "points": [ { "fx": 0.2, "y": 0.3, "p": 0.6 } ] } ]
  },
  "history": [
    { "id": 1, "at": "2026-08-19T10:00:00+09:00", "who": "name", "role": "原画", "note": "取り込み: x.xdts", "fingerprint": "sha256:…", "sheet": { "…同じ形のスナップショット…" } }
  ],
  "annotations": [
    { "id": "a1", "kind": "shusei", "who": "name", "role": "作監", "at": "…", "anchor": { "layer": "A", "komaStart": 3, "komaEnd": 5 }, "text": "ここ2コマ詰め", "state": "要", "madeAgainst": 1, "resolvedIn": null }
  ],
  "extensions": { "xdts": { "source": "x.xdts", "text": "…原本の全文…" } }
}
```

### `cut` — 紙の上段
`title` 作品名、`episode` 話数、`scene` シーン、`cut` カット、`author` 作業者、`memo` メモ欄の文字、`memoHeight` メモ欄（描画領域）の高さ px、`fps` は 24 固定。表示・ファイル名では 話数 2桁・シーン 2桁・カット 3桁にゼロ埋め（数字のときだけ）。

### `sheet` — 現在の状態
- `duration` 本尺（コマ）。`slackHead` / `slack` 頭と尻の余尺（コマ）。総尺 = `slackHead + duration + slack`
- `layers[]` 原画欄。`cells` は**コマ展開済み**（総尺の長さ。先頭が1コマ目）。ホールドは同じ値の連続。空セルは `"×"`。中割記号は `SYMBOL_TICK_1` / `SYMBOL_TICK_2`
- `douga[]` 動画欄（原画欄と同じ形。原画の番号と中割から通し番号を振って生成し、編集もできる）
- `dialogue[]` 台詞。`from`/`to` は1始まりのコマ、`speaker` 話者、`kind` は `""`（ON・口パクあり）/ `M`（モノローグ）/ `OFF`（画面外）/ `N`（ナレーション）/ `SE`（効果音）、`lane` 0/1 = S1/S2
- `camera[]` カメラワーク。`kind` は `FIX` `PAN` `T.U` `T.B` `Follow` `F.I` `F.O` `O.L` `SL` か空（自由文は `text`）、`fromLabel`/`toLabel` 前後のフレーム名、`lane` 0/1 = CAM1/CAM2。`tdtsCode` があれば TDTS の指示コード（未知のコードは数字のまま保つ）
- `ink[]` 手書きの線（ベクトル）。`zone:"memo"` は上段メモ欄の相対座標（`fx`, `y` は幅・高さに対する割合、`p` 筆圧）

### `history[]` — 版（追記のみ）
上書き保存のたびに1件重なる。`sheet` はその時点のスナップショット全体、`fingerprint` は文書指紋（セル欄の正規化指紋＋動画欄＋台詞＋カメラ＋手書き＋上段）。過去の版に戻すときも、その内容で新しい版を重ねる（履歴は消えない）。

### `annotations[]` — 修正指示・申し送り
`kind` は `shusei`（修正指示）/ `moushiokuri`（申し送り）/ `kakunin`（要確認）。`anchor` は**レイヤー名＋コマ範囲**（トラック番号は使わない。他ツールが再構築しても追える）。`madeAgainst` はどの版に対して書いたか、`resolvedIn` はどの版で解消したか、`state` は `要` / `済`。

### `extensions`
受け取った原本の生テキスト（`xdts` / `toei`(tdts)）。捨てない。

## セル欄の正規化指紋
全部空のレイヤーを除き、レイヤー名の辞書順で `duration=48;A=1,1,1,…;B=…` と連結した文字列の SHA-256。CLIP STUDIO のような再構築型の書き出し（トラックの並び替え・空トラックの追加）を挟んでも、タイミングとセル番号が同じなら一致する。

## XDTS / TDTS への写像
- XDTS: CLIP STUDIO が吐く version 5 の最小構造（`header` / `timeTables` / `version`）。`duration` は総尺、フレームは0始まりの変化点、空は `SYMBOL_NULL_CELL`。台詞・カメラは fieldId 3 / 5 に TDTS と同じ形で書く（開始コマに値、続くコマは `SYMBOL_HYPHEN`）
- TDTS: 東映 DTS の version 7 の形。`timeSheets[]` で包み、`header.episode` は `略称#話数`（`title` + `#` + `episode`）、`operatorName` に `author`、`direction` に `memo`。履歴を `sheet2, sheet3…` として並べる選択肢あり
- 手書きの線・修正指示・履歴は XDTS / TDTS に語彙が無いので出さない
