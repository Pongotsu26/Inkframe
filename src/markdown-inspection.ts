import { extname } from "node:path";

export interface MarkdownInspection {
  outline: Array<{ level: number; text: string; line: number }>;
  issues: Array<{ severity: "error" | "warning" | "info"; message: string; line: number; column: number }>;
  assets: Array<{ path: string; line: number; kind: string }>;
}

export function inspectMarkdown(content: string): MarkdownInspection {
  const outline: MarkdownInspection["outline"] = [];
  const issues: MarkdownInspection["issues"] = [];
  const assets: MarkdownInspection["assets"] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+)/.exec(line);
    if (heading) outline.push({ level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, ""), line: index + 1 });
    for (const match of line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assets.push({ path: match[1], line: index + 1, kind: extname(match[1]).slice(1).toUpperCase() || "FILE" });
    if (/\bTODO\b/i.test(line)) issues.push({ severity: "info", message: "TODO が残っています", line: index + 1, column: line.search(/TODO/i) + 1 });
    // # の連続全体を確認し、1〜6個の直後が空白でも行末でもない場合だけ警告する。
    if (/^#{1,6}[^#\s]/.test(line)) issues.push({ severity: "warning", message: "見出し記号の後に空白が必要です", line: index + 1, column: 1 });
  });
  if (!outline.length && content.trim()) issues.push({ severity: "info", message: "見出しがありません", line: 1, column: 1 });
  return { outline, issues, assets };
}
