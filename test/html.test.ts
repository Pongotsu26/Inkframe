import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addCaptions,
  addHeadingIdsAndToc,
  markdownToHtml,
  sanitizeDangerousHtml,
  transformDefinitionLists,
} from "../src/html.js";
import { parseMacFontFamilies, parseMacFonts } from "../src/fonts.js";

describe("addHeadingIdsAndToc", () => {
  it("見出しに安定した ID を付け、目次プレースホルダーを展開する", () => {
    const html = '<div id="mdpdf-toc"></div><h1>はじめに</h1><h2>背景</h2>';
    const result = addHeadingIdsAndToc(html, true);
    expect(result).toContain('href="#はじめに"');
    expect(result).toContain('<h2 id="背景">背景</h2>');
  });

  it("目次が無効ならプレースホルダーを除去する", () => {
    expect(
      addHeadingIdsAndToc('<div id="mdpdf-toc"></div><h1>Title</h1>', false),
    ).not.toContain("mdpdf-toc");
  });

  it("目次の位置を指定しなければ文書先頭の見出しの後に置く", () => {
    const result = addHeadingIdsAndToc("<h1>Title</h1><p>本文</p>", true);
    expect(result).toContain('</h1><nav class="toc"');
  });
});

describe("local fonts", () => {
  it("macOS のフォント情報から CSS で指定できるファミリー名だけを取得する", () => {
    const output =
      "    Font.ttf:\n      Typefaces:\n        Font-Regular:\n          Family: Test Sans\n          Style: Regular\n        Font-Bold:\n          Family: Test Sans\n          Style: Bold\n          Family: 日本語フォント\n";
    expect(parseMacFontFamilies(output)).toEqual([
      "Test Sans",
      "日本語フォント",
    ]);
  });

  it("macOS のフォント情報からファミリーごとのウェイトを取得する", () => {
    const output = `
        A-OTF-UDShinGoPro-L:
          Full Name: A-OTF UD新ゴ Pro L
          Family: A-OTF UD新ゴ Pro
          Style: L
        A-OTF-UDShinGoPro-DB:
          Full Name: A-OTF UD新ゴ Pro DB
          Family: A-OTF UD新ゴ Pro
          Style: DB`;
    expect(parseMacFonts(output)).toEqual([
      {
        family: "A-OTF UD新ゴ Pro",
        faces: [
          { name: "A-OTF UD新ゴ Pro DB", style: "DB" },
          { name: "A-OTF UD新ゴ Pro L", style: "L" },
        ],
      },
    ]);
  });
});

describe("extended Markdown", () => {
  it("絶対パスのカスタムテーマ CSS を読み込む", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-custom-theme-"));
    const input = join(directory, "sample.md");
    const theme = join(directory, "theme.css");
    await writeFile(input, "# Custom theme");
    await writeFile(theme, ".markdown-body { color: rgb(1, 2, 3); }");
    const document = await markdownToHtml(input, { theme });
    expect(document.html).toContain(".markdown-body { color: rgb(1, 2, 3); }");
  });

  it("定義リストをセマンティックな HTML に変換する", () => {
    const result = transformDefinitionLists("用語\n: 説明 1\n: 説明 2\n");
    expect(result).toBe(
      "<dl><dt>用語</dt><dd>説明 1</dd><dd>説明 2</dd></dl>\n",
    );
  });

  it("コードフェンス内の定義リスト風テキストは変更しない", () => {
    const result = transformDefinitionLists("```md\n用語\n: 定義\n```");
    expect(result).toBe("```md\n用語\n: 定義\n```");
  });

  it("図・表のラベルをキャプションにする", () => {
    expect(
      addCaptions('<p><img src="diagram.svg" alt="図 1: 構成図"></p>'),
    ).toContain("<figcaption>図 1: 構成図</figcaption>");
    expect(
      addCaptions(
        "<p>表 1: 結果</p>\n<table><tbody><tr><td>OK</td></tr></tbody></table>",
      ),
    ).toContain('<figure class="table-figure">');
  });

  it("GFM、数式、改ページ、PDF 非表示コメントを HTML に反映する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "sample.md");
    await writeFile(
      input,
      [
        "---",
        "title: テスト文書",
        "---",
        "",
        "# 見出し",
        "",
        "- [x] 完了",
        "",
        "式 $E = mc^2$[^note]",
        "",
        "[^note]: 脚注",
        "",
        "用語",
        ": 定義",
        "",
        "![図 1: 図の説明](diagram.svg)",
        "",
        "<!-- pagebreak -->",
        "",
        "<!-- pdf-ignore-start -->非表示<!-- pdf-ignore-end -->",
      ].join("\n"),
    );

    const document = await markdownToHtml(input, {
      theme: "github",
      toc: true,
      math: true,
    });
    expect(document.html).toContain('type="checkbox" checked');
    expect(document.html).toContain("katex");
    expect(document.html).toContain(
      "node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2",
    );
    expect(document.html).toContain("<dl><dt>用語</dt><dd>定義</dd></dl>");
    expect(document.html).toContain("<figcaption>図 1: 図の説明</figcaption>");
    expect(document.html).toContain('class="pagebreak"');
    expect(document.html).not.toContain("非表示");
    expect(document.html).toContain("data-footnotes");
  });

  it("数式を無効化したときは KaTeX を展開しない", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "math.md");
    await writeFile(input, "$x^2$");
    const document = await markdownToHtml(input, {
      theme: "github",
      math: false,
    });
    expect(document.html).not.toContain('<span class="katex">');
    expect(document.html).toContain("$x^2$");
  });

  it("Markdown内の改行を設定に応じてbr要素へ変換する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-breaks-"));
    const input = join(directory, "breaks.md");
    await writeFile(input, "1行目\n2行目");

    const withoutBreaks = await markdownToHtml(input, {
      theme: "github",
      lineBreaks: false,
    });
    const withBreaks = await markdownToHtml(input, {
      theme: "github",
      lineBreaks: true,
    });

    expect(withoutBreaks.html).toContain("<p>1行目\n2行目</p>");
    expect(withoutBreaks.html).not.toContain("<br>");
    expect(withBreaks.html).toContain("<p>1行目<br>\n2行目</p>");
  });

  it("コードハイライトテーマを指定できる", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "code-theme.md");
    await writeFile(input, "```ts\nconst value = 1;\n```");
    const document = await markdownToHtml(input, {
      theme: "github",
      codeTheme: "light-plus",
    });
    expect(document.html).toContain('class="shiki light-plus"');
  });

  it("コードブロックに共通の余白・枠線・背景を適用する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "code-block-style.md");
    await writeFile(input, "```\ncode\n```");
    const document = await markdownToHtml(input, {
      theme: "github",
      codeTheme: "light-plus",
    });
    expect(document.html).toContain("margin-top: 1.5rem;");
    expect(document.html).toContain("padding: 1rem;");
    expect(document.html).toContain("border: 1px solid #e5e7eb;");
    expect(document.html).toContain("border-radius: .75rem;");
    expect(document.html).toContain("background: #f9fafb !important;");
    expect(document.html).not.toContain("overflow-x: auto;");
  });

  it("dark系のコードハイライトテーマでは余白と丸みだけを適用する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "dark-code-block-style.md");
    await writeFile(input, "```\ncode\n```");
    const document = await markdownToHtml(input, {
      theme: "github",
      codeTheme: "github-dark",
    });
    expect(document.html).toContain('class="shiki github-dark"');
    expect(document.html).toContain("margin-top: 1.5rem;");
    expect(document.html).toContain("padding: 1rem;");
    expect(document.html).toContain("border-radius: .75rem;");
    expect(document.html).not.toContain("overflow-x: auto;");
    expect(document.html).not.toContain("border: 1px solid #e5e7eb;");
    expect(document.html).not.toContain("background: #f9fafb !important;");
  });

  it("本文と見出しのフォントサイズをpt単位で反映する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "font-size.md");
    await writeFile(input, "# 見出し\n\n本文");
    const document = await markdownToHtml(input, {
      theme: "github",
      fontSize: { body: 10.5, heading: 18 },
    });
    expect(document.html).toContain("--body-font-size: 10.5pt");
    expect(document.html).toContain("h1 { font-size: 18pt !important; }");
    expect(document.html).toContain("h6 { font-size: 18pt !important; }");
  });

  it("選択したフォントフェイスをファミリーより優先する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "font-face.md");
    await writeFile(input, "# 見出し\n\n本文");
    const document = await markdownToHtml(input, {
      theme: "github",
      font: { body: "A-OTF UD新ゴ Pro" },
      fontFace: { body: "A-OTF UD新ゴ Pro DB" },
    });
    expect(document.html).toContain('--body-font: "A-OTF UD新ゴ Pro DB",');
  });

  it("h1〜h6に個別のフォントサイズを設定する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "heading-fonts.md");
    await writeFile(input, "# H1\n\n## H2");
    const document = await markdownToHtml(input, {
      theme: "github",
      fontSize: { h1: 20, h2: 16 },
    });
    expect(document.html).toContain("h1 { font-size: 20pt !important; }");
    expect(document.html).toContain("h2 { font-size: 16pt !important; }");
  });

  it("見出しサイズ未指定時はテーマ既定の階層を維持する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "default-heading-size.md");
    await writeFile(input, "# 見出し\n\n本文");
    const document = await markdownToHtml(input, {
      theme: "github",
      fontSize: { body: 10.5 },
    });
    expect(document.html).not.toContain("h1, h2, h3, h4, h5, h6 { font-size:");
  });

  it("実行可能な HTML を除去し、通常の HTML は残す", () => {
    const result = sanitizeDangerousHtml(
      '<p onclick="alert(1)">本文</p><script>alert(1)</script><img src="javascript:alert(1)">',
    );
    expect(result).toBe("<p>本文</p><img>");
  });
});
