import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCaptions, addHeadingIdsAndToc, markdownToHtml, sanitizeDangerousHtml, transformDefinitionLists } from "../src/html.js";
import { parseMacFontFamilies } from "../src/fonts.js";

describe("addHeadingIdsAndToc", () => {
  it("見出しに安定した ID を付け、目次プレースホルダーを展開する", () => {
    const html = '<div id="mdpdf-toc"></div><h1>はじめに</h1><h2>背景</h2>';
    const result = addHeadingIdsAndToc(html, true);
    expect(result).toContain('href="#はじめに"');
    expect(result).toContain('<h2 id="背景">背景</h2>');
  });

  it("目次が無効ならプレースホルダーを除去する", () => {
    expect(addHeadingIdsAndToc('<div id="mdpdf-toc"></div><h1>Title</h1>', false)).not.toContain("mdpdf-toc");
  });

  it("目次の位置を指定しなければ文書先頭の見出しの後に置く", () => {
    const result = addHeadingIdsAndToc("<h1>Title</h1><p>本文</p>", true);
    expect(result).toContain('</h1><nav class="toc"');
  });
});

describe("local fonts", () => {
  it("macOS のフォント情報から CSS で指定できるファミリー名だけを取得する", () => {
    const output = "    Font.ttf:\n      Typefaces:\n        Font-Regular:\n          Family: Test Sans\n          Style: Regular\n        Font-Bold:\n          Family: Test Sans\n          Style: Bold\n          Family: 日本語フォント\n";
    expect(parseMacFontFamilies(output)).toEqual(["Test Sans", "日本語フォント"]);
  });
});

describe("extended Markdown", () => {
  it("定義リストをセマンティックな HTML に変換する", () => {
    const result = transformDefinitionLists("用語\n: 説明 1\n: 説明 2\n");
    expect(result).toBe("<dl><dt>用語</dt><dd>説明 1</dd><dd>説明 2</dd></dl>\n");
  });

  it("コードフェンス内の定義リスト風テキストは変更しない", () => {
    const result = transformDefinitionLists("```md\n用語\n: 定義\n```");
    expect(result).toBe("```md\n用語\n: 定義\n```");
  });

  it("図・表のラベルをキャプションにする", () => {
    expect(addCaptions('<p><img src="diagram.svg" alt="図 1: 構成図"></p>')).toContain('<figcaption>図 1: 構成図</figcaption>');
    expect(addCaptions('<p>表 1: 結果</p>\n<table><tbody><tr><td>OK</td></tr></tbody></table>')).toContain('<figure class="table-figure">');
  });

  it("GFM、数式、改ページ、PDF 非表示コメントを HTML に反映する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "sample.md");
    await writeFile(input, [
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
      "<!-- pdf-ignore-start -->非表示<!-- pdf-ignore-end -->"
    ].join("\n"));

    const document = await markdownToHtml(input, { theme: "github", toc: true, math: true });
    expect(document.html).toContain('type="checkbox" checked');
    expect(document.html).toContain("katex");
    expect(document.html).toContain("node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2");
    expect(document.html).toContain('<dl><dt>用語</dt><dd>定義</dd></dl>');
    expect(document.html).toContain('<figcaption>図 1: 図の説明</figcaption>');
    expect(document.html).toContain('class="pagebreak"');
    expect(document.html).not.toContain("非表示");
    expect(document.html).toContain("data-footnotes");
  });

  it("数式を無効化したときは KaTeX を展開しない", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-html-"));
    const input = join(directory, "math.md");
    await writeFile(input, "$x^2$");
    const document = await markdownToHtml(input, { theme: "github", math: false });
    expect(document.html).not.toContain('<span class="katex">');
    expect(document.html).toContain("$x^2$");
  });

  it("実行可能な HTML を除去し、通常の HTML は残す", () => {
    const result = sanitizeDangerousHtml('<p onclick="alert(1)">本文</p><script>alert(1)</script><img src="javascript:alert(1)">');
    expect(result).toBe("<p>本文</p><img>");
  });
});
