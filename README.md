# Inkframe

Markdownを、美しく読みやすいPDFへ。Inkframeはローカル環境で完結するTypeScript製の組版スタジオです。日本語フォント、GFM、KaTeX、Mermaid、目次、ページ番号に対応します。

## セットアップ

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
```

開発中は `pnpm dev --`、ビルド後は `node dist/cli.js` を使います。グローバルに使う場合は、プロジェクト内で `pnpm link --global` を実行します。

```bash
pnpm dev -- examples/report.md -o output/report.pdf
node dist/cli.js examples/report.md -o output/report.pdf
```

## 使用例

```bash
inkframe report.md -o report.pdf

inkframe report.md \
  --theme university \
  --body-font "BIZ UDPGothic" \
  --heading-font "BIZ UDPMincho" \
  --paper A4 \
  --toc \
  --page-number

inkframe README.md --theme github --code-theme github-dark --mermaid --math

inkframe report.md --cover

inkframe fonts
```

## 実用コマンド（Phase 2）

```bash
# 保存時に再生成
inkframe watch report.md -o report.pdf

# 章ごとの Markdown を 1 つの PDF に結合
inkframe build intro.md chapter1.md chapter2.md -o book.pdf --compress

# フォルダを再帰的に一括変換
inkframe batch ./docs --out ./pdf --image-optimize --image-quality 85

# 既存 PDF を結合
inkframe merge a.pdf b.pdf -o merged.pdf
```

`--compress`、`--image-optimize`、`build`、`merge` は Ghostscript を利用します。macOS では `brew install ghostscript`、Windows/Linux では OS のパッケージ管理機能で Ghostscript を導入してください。

## Desktop 版（Phase 3）

Electron 製のローカル Desktop アプリを起動できます。

```bash
pnpm desktop
```

アプリアイコンは `assets/icon.svg` をフラット版の正本とし、ImageMagick導入後に `pnpm icon:build` で1024px PNGとRetina対応ICNSを再生成できます。macOS 26以降のLiquid Glass版は `assets/Inkframe.icon` に背景・フレーム・紙・組版記号を分離したIcon Composerレイヤーとして収録しています。`pnpm package:mac` は `/Applications` のXcode 26以降（`Xcode.app` または `Xcode-beta.app`）を自動検出し、electron-builderで `.icon` を `Assets.car` へコンパイルします。

Desktop版は、実際のPDFと同一レイアウトのページプレビュー、テーマ・用紙・余白・フォントの選択、PDFワンクリック生成を提供します。Markdownをドロップして開けるほか、アウトライン・Issues・Assets・履歴を確認できます。設定や履歴はOSのアプリデータ領域にローカル保存され、Markdownを外部送信しません。

PDFプレビューはアプリに同梱したPDF.jsで描画するため、Popplerなどの外部ツールは不要です。

主なオプション:

- `--theme github|university|technical|paper|minutes|slides|ebook|monochrome|vertical-japanese|resume`: テーマを選択
- `--font`, `--body-font`, `--heading-font`, `--code-font`: ローカルフォントを指定
- `--paper A4|A5|Letter`, `--margin "20mm 18mm"`: 印刷設定
- `--toc`, `--page-number`, `--header`, `--footer`: 文書構成とヘッダー・フッター
- `--css ./print.css`: テーマに追加する CSS
- `--mermaid` / `--no-mermaid`: Mermaid の SVG 化を有効・無効化
- `--math` / `--no-math`: KaTeX による数式を有効・無効化
- `--cover`: Frontmatter の題目・授業名・学籍番号等から表紙を生成
- `--allow-external-resources`: 外部 URL の画像・スタイル等の読み込みを許可（既定では遮断）

## 設定と優先順位

入力ファイルの親ディレクトリから上へ `inkframe.config.json` またはJSON形式の `.inkframerc` を探索します。旧名の `mdpdf.config.json` と `.mdpdfrc` も互換性のため読み込めます。設定の優先順位は、組み込み既定値 → 設定ファイル → YAML frontmatter → CLI引数です。

```json
{
  "theme": "university",
  "paper": "A4",
  "toc": true,
  "pageNumber": true,
  "font": {
    "body": "BIZ UDPGothic",
    "heading": "BIZ UDPMincho",
    "code": "JetBrains Mono"
  }
}
```

```yaml
---
title: 情報科学レポート
author: 山田太郎
course: 情報科学
studentId: 12345678
instructor: 山田教授
cover: true
theme: university
toc: true
pageNumber: true
font:
  body: BIZ UDPGothic
  heading: BIZ UDPMincho
---
```

目次は Markdown 内に `[[toc]]` を置く位置に生成します。省略時は目次は表示されません。`<!-- pagebreak -->` または `:::pagebreak ... :::` による改ページと、`pdf-ignore-start` / `pdf-ignore-end` コメントによる PDF 非表示範囲にも対応しています。定義リストは `用語` の次行を `: 定義` とし、画像は `![図 1: キャプション](image.png)` の形式でキャプションを付けられます。表は表の直前に `表 1: キャプション` と記述します。

Chromium が実際に使用したローカルフォントは PDF に埋め込まれるため、生成済み PDF は他の PC でも同じ字形で表示されます（ライセンスにより埋め込みが禁止されたフォントを除く）。

`cover: true` または `--cover` を指定すると、タイトル・授業名・学籍番号・氏名・担当教員・提出日から表紙を生成します。PDF のタイトル、著者、件名、キーワード、言語は Frontmatter の `title`、`author`、`subject`、`keywords`、`language` で指定できます。

## セキュリティと制約

変換はローカルで完結し、Markdown を外部へ送信しません。外部 URL のリソース読み込みは既定で遮断し、必要な場合だけ `--allow-external-resources` を指定します。Mermaid は Chromium 内で `securityLevel: strict` を指定して描画します。HTML 混在ではスクリプト・埋め込み・イベント属性を除去しますが、信頼できない Markdown は変換しないでください。

Phase 1〜3（CLI MVP、実用 CLI、Desktop 版）を実装しています。Editor 連携と Cloud 機能は次フェーズの範囲です。
