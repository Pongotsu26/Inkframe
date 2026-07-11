import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";
import { codeToHtml } from "shiki";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import { DEFAULT_CODE_THEME, type MdpdfConfig } from "./types.js";

const require = createRequire(import.meta.url);
const FALLBACK_FONTS = '"Noto Sans JP", "BIZ UDPGothic", system-ui, sans-serif';
const CODE_BLOCK_CSS = `
pre {
  margin-top: 1.5rem;
  padding: 1rem;
  border-radius: .75rem;
}
`;
const LIGHT_CODE_BLOCK_CSS = `
pre {
  border: 1px solid #e5e7eb;
  border-radius: .75rem;
  background: #f9fafb !important;
}
`;
const DARK_CODE_THEMES = new Set(["github-dark", "dark-plus", "nord", "one-dark-pro", "dracula"]);

export interface HtmlDocument {
  html: string;
  frontmatter: MdpdfConfig;
  mermaidScriptPath: string;
}

function textValue(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function escapeAttribute(value: unknown): string {
  return textValue(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'");
}

function escapeHtml(value: unknown): string {
  return textValue(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
}

/**
 * Convert the simple Markdown definition-list form supported by many Markdown
 * editors into semantic HTML. The base CommonMark parser deliberately leaves
 * this extension as paragraph text, so it is normalized before parsing.
 */
export function transformDefinitionLists(source: string): string {
  const lines = source.split("\n");
  const result: string[] = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence || !line.trim() || /^\s/.test(line) || !/^\s*:[ \t]+/.test(lines[index + 1] ?? "")) {
      result.push(line);
      continue;
    }

    const entries: Array<{ term: string; definitions: string[] }> = [];
    while (true) {
      const term = lines[index].trim();
      const definitions: string[] = [];
      index += 1;
      while (index < lines.length && /^\s*:[ \t]+/.test(lines[index])) {
        definitions.push(lines[index].replace(/^\s*:[ \t]+/, "").trim());
        index += 1;
      }
      entries.push({ term, definitions });
      if (!lines[index]?.trim() || /^\s/.test(lines[index] ?? "") || !/^\s*:[ \t]+/.test(lines[index + 1] ?? "")) break;
    }
    result.push(`<dl>${entries.map(({ term, definitions }) => `<dt>${escapeHtml(term)}</dt>${definitions.map((definition) => `<dd>${escapeHtml(definition)}</dd>`).join("")}`).join("")}</dl>`);
    index -= 1;
  }
  return result.join("\n");
}

/** Add a visible caption when an image alt text follows "図 1: caption". */
export function addCaptions(content: string): string {
  const withImageCaptions = content.replace(/<p>(<img\b[^>]*\balt="([^"]*)"[^>]*>)<\/p>/g, (_match, image: string, alt: string) => {
    const caption = decodeHtml(alt).trim();
    if (!/^(?:図|Figure|Fig\\.?|表|Table)\s*\d*\s*[:：]/iu.test(caption)) return _match;
    return `<figure class="image-figure">${image}<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  });
  return withImageCaptions.replace(/<p>((?:表|Table)\s*\d*\s*[:：]\s*[^<]+)<\/p>\n(<table>[\s\S]*?<\/table>)/giu, (_match, caption: string, table: string) => {
    return `<figure class="table-figure">${table}<figcaption>${escapeHtml(caption.trim())}</figcaption></figure>`;
  });
}

/**
 * HTML 混在は維持しつつ、Chromium で実行または外部文書の読み込みにつながる
 * 要素とイベント属性を取り除く。変換対象は信頼できるローカル Markdown に
 * 限定するという CLI の方針も併せて維持する。
 */
export function sanitizeDangerousHtml(content: string): string {
  return content
    .replace(/<(?:script|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:script|iframe|object|embed|form)\s*>/gi, "")
    .replace(/<\/?(?:script|iframe|object|embed|base|form)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:href|src)\s*=\s*(?:\s*"\s*javascript:[^"]*"|\s*'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi, "");
}

function cover(options: MdpdfConfig): string {
  if (!options.cover) return "";
  const fields = [
    { label: "授業名", value: options.course },
    { label: "学籍番号", value: options.studentId },
    { label: "氏名", value: options.author },
    { label: "担当教員", value: options.instructor },
    { label: "提出日", value: options.date }
  ].filter((field): field is { label: string; value: string } => Boolean(field.value));
  return `<section class="cover" aria-label="表紙"><h1>${escapeHtml(options.title ?? "")}</h1><dl>${fields.map(({ label, value }) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl></section>`;
}

function slugify(value: string, used: Map<string, number>): string {
  const base = value.toLowerCase().trim().replace(/<[^>]*>/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

export function addHeadingIdsAndToc(content: string, enabled: boolean): string {
  const headings: Array<{ level: number; id: string; text: string }> = [];
  const used = new Map<string, number>();
  const withIds = content.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_match, level, rawText) => {
    const text = rawText.replace(/<[^>]*>/g, "").trim();
    const id = slugify(text, used);
    headings.push({ level: Number(level), id, text });
    return `<h${level} id="${id}">${rawText}</h${level}>`;
  });
  if (!enabled) return withIds.replace('<div id="mdpdf-toc"></div>', "");
  const entries = headings.map(({ level, id, text }) => `<li class="toc-level-${level}"><a href="#${id}">${text}</a></li>`).join("\n");
  const toc = headings.length ? `<nav class="toc" aria-label="目次"><h2>目次</h2><ol>${entries}</ol></nav>` : "";
  if (withIds.includes('<div id="mdpdf-toc"></div>')) return withIds.replace('<div id="mdpdf-toc"></div>', toc);
  return withIds.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/, `$1${toc}`);
}

async function highlightCodeBlocks(content: string, theme: string): Promise<string> {
  const blocks = [...content.matchAll(/<pre><code(?: class="language-([^" ]+)")?>([\s\S]*?)<\/code><\/pre>/g)];
  let result = content;
  for (const block of blocks) {
    const language = block[1] || "text";
    if (language === "mermaid") {
      result = result.replace(block[0], `<pre class="mermaid">${block[2]}</pre>`);
      continue;
    }
    try {
      const highlighted = await codeToHtml(decodeHtml(block[2]), { lang: language, theme });
      result = result.replace(block[0], highlighted);
    } catch {
      result = result.replace(block[0], `<pre class="shiki"><code>${block[2]}</code></pre>`);
    }
  }
  return result;
}

async function loadTheme(theme: string): Promise<string> {
  const themePath = join(dirname(import.meta.dirname), "themes", theme, "theme.css");
  try {
    return await readFile(themePath, "utf8");
  } catch {
    throw new Error(`テーマが見つかりません: ${theme}`);
  }
}

function codeBlockCss(theme: string): string {
  return DARK_CODE_THEMES.has(theme) ? CODE_BLOCK_CSS : `${CODE_BLOCK_CSS}${LIGHT_CODE_BLOCK_CSS}`;
}

export async function markdownToHtml(inputPath: string, options: MdpdfConfig): Promise<HtmlDocument> {
  const source = await readFile(inputPath, "utf8");
  const parsed = matter(source);
  const frontmatter = parsed.data as MdpdfConfig;
  const transformed = transformDefinitionLists(parsed.content
    .replace(/<!--[\s]*pdf-ignore-start[\s]*-->[\s\S]*?<!--[\s]*pdf-ignore-end[\s]*-->/g, "")
    .replace(/<!--[\s]*pagebreak[\s]*-->/g, '<div class="pagebreak"></div>')
    .replace(/:::pagebreak\s*:::/g, '<div class="pagebreak"></div>')
    .replace(/^\[\[toc\]\]$/im, '<div id="mdpdf-toc"></div>'));
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm);
  if (options.math !== false) processor.use(remarkMath);
  processor.use(remarkRehype, { allowDangerousHtml: true });
  if (options.math !== false) processor.use(rehypeKatex);
  const rendered = String(await processor
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(transformed));
  const codeTheme = options.codeTheme ?? DEFAULT_CODE_THEME;
  const content = addCaptions(addHeadingIdsAndToc(await highlightCodeBlocks(sanitizeDangerousHtml(rendered), codeTheme), options.toc ?? false));
  const themeCss = await loadTheme(options.theme ?? "github");
  const katexCssPath = require.resolve("katex/dist/katex.min.css");
  // KaTeX ships font URLs relative to its CSS file. The document base URL points
  // to the Markdown directory for image support, so make these URLs absolute.
  const katexFontsUrl = pathToFileURL(`${join(dirname(katexCssPath), "fonts")}/`).href;
  const katexCss = (await readFile(katexCssPath, "utf8")).replaceAll("url(fonts/", `url(${katexFontsUrl}`);
  const customCss = options.css ? await readFile(isAbsolute(options.css) ? options.css : resolve(dirname(inputPath), options.css), "utf8") : "";
  const bodyFont = options.font?.body ? `"${escapeAttribute(options.font.body)}", ${FALLBACK_FONTS}` : FALLBACK_FONTS;
  const headingFont = options.font?.heading ? `"${escapeAttribute(options.font.heading)}", ${bodyFont}` : bodyFont;
  const codeFont = options.font?.code ? `"${escapeAttribute(options.font.code)}", ui-monospace, monospace` : "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const title = options.title ?? frontmatter.title ?? basename(inputPath);
  const metadata = { ...frontmatter, ...options, title };
  const language = metadata.language ?? "ja";
  const keywords = Array.isArray(metadata.keywords) ? metadata.keywords.join(", ") : metadata.keywords;
  return {
    frontmatter,
    mermaidScriptPath: require.resolve("mermaid/dist/mermaid.min.js"),
    html: `<!doctype html><html lang="${escapeAttribute(language)}"><head><meta charset="utf-8"><base href="${pathToFileURL(`${dirname(inputPath)}/`).href}"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="author" content="${escapeAttribute(metadata.author ?? "")}"><meta name="subject" content="${escapeAttribute(metadata.subject ?? "")}"><meta name="keywords" content="${escapeAttribute(keywords ?? "")}"><title>${escapeAttribute(title)}</title><style>${katexCss}\n${themeCss}\n${codeBlockCss(codeTheme)}\n${customCss}\n:root { --body-font: ${bodyFont}; --heading-font: ${headingFont}; --code-font: ${codeFont}; }</style></head><body>${cover(metadata)}<main class="markdown-body">${content}</main></body></html>`
  };
}
