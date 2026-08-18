# VDTS Editor

ブラウザで動くアニメーション用タイムシートエディタ。紙のタイムシートの見た目と書き味でセル番号・タイミングを編集し、**履歴付きの正本形式 VDTS**（`.vdts`）で保存する。**XDTS**（CLIP STUDIO PAINT 等）と **TDTS**（東映アニメーション デジタルタイムシート）を読み書きする。単一の HTML ファイルで、インストールもサーバーも要らない。

A browser-based animation timesheet editor. Edit cel numbers and timing with the look and feel of a paper timesheet, and save to **VDTS** (`.vdts`) — a master format that keeps the full revision history. Reads and writes **XDTS** (CLIP STUDIO PAINT and others) and **TDTS** (Toei Animation Digital Timesheet). One HTML file; nothing to install.

## 使い方 / Usage

`vdts-editor.html` を Chrome か Edge で開く（保存には File System Access API を使う。Safari では開く・編集はできるが保存はダウンロードになる）。

Open `vdts-editor.html` in Chrome or Edge (saving uses the File System Access API; Safari can open and edit but saves as a download).

- **新規作成** / **開く**（`.xdts` `.tdts` `.vdts`、ドラッグ＆ドロップ可）
- 数字のマスをタップ → その場で書き直す。原画と原画の間の線をタップ → 中割○。番号を上下にドラッグ → ツメ
- 台詞欄・カメラ欄は空きをタップして置き、端をドラッグして伸縮
- **上書き保存** で版が1つ重なる（誰が・どの役で・ひとこと）。**版 N** で過去の版を表示し、その内容に戻せる
- 作品名・話数・シーン・カットを書き換えると **新規保存** になり、元のファイルには上書きせず新しい `.vdts` に保存する
- **xdts 書き出し** / **tdts 書き出し**、**取り込み**（他のシートの原画欄で差し替え）
- 詳しくは画面左の「使い方」

## VDTS 形式 / The VDTS format

`docs/VDTS-format.md`（日本語）/ `docs/VDTS-format.en.md`（English）

## 検証 / Tests

```
node verify.js
```
Node が無い Mac では jsc でも動く: `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc verify.js`

`samples/` の xdts / tdts / vdts は架空の内容の合成サンプル。

## 謝辞 / Acknowledgements

入力の手触り（マスをタップした瞬間に書ける、打った瞬間に反映、確定なし、中割はタップ1回、メモは紙の上）は、moaang 氏の [Auto Sheet](https://github.com/moaang/auto-sheet)（MIT）の設計から学んだ。コードは含んでいない。

The input design (tap a cell and write immediately, apply as you type, no confirm step, one tap for an inbetween mark, notes on the paper) follows moaang's [Auto Sheet](https://github.com/moaang/auto-sheet) (MIT). No code from it is included.

## ライセンス / License

MIT — see `LICENSE`.
