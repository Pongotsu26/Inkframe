import { watch, type FSWatcher } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import matter from "gray-matter";
import { listFonts } from "../fonts.js";
import { convertMarkdown, type ConvertOptions } from "../renderer.js";
import { listThemes } from "../themes.js";

interface HistoryItem { path: string; outputPath?: string; openedAt: string; }
interface Template { id: string; name: string; options: ConvertOptions; updatedAt: string; }
interface SettingsHistory { options: ConvertOptions; usedAt: string; }
let mainWindow: BrowserWindow | undefined;
let activeWatcher: FSWatcher | undefined;
const execFileAsync = promisify(execFile);
function historyPath(): string { return join(app.getPath("userData"), "history.json"); }
function templatesPath(): string { return join(app.getPath("userData"), "templates.json"); }
function settingsHistoryPath(): string { return join(app.getPath("userData"), "settings-history.json"); }
async function history(): Promise<HistoryItem[]> { try { return JSON.parse(await readFile(historyPath(), "utf8")) as HistoryItem[]; } catch { return []; } }
async function record(item: Omit<HistoryItem, "openedAt">): Promise<void> {
  const entries = (await history()).filter((entry) => entry.path !== item.path);
  entries.unshift({ ...item, openedAt: new Date().toISOString() });
  await mkdir(dirname(historyPath()), { recursive: true });
  await writeFile(historyPath(), JSON.stringify(entries.slice(0, 20), null, 2));
}
async function templates(): Promise<Template[]> { try { return JSON.parse(await readFile(templatesPath(), "utf8")) as Template[]; } catch { return []; } }
async function writeTemplates(values: Template[]): Promise<void> { await mkdir(dirname(templatesPath()), { recursive: true }); await writeFile(templatesPath(), JSON.stringify(values, null, 2)); }
async function settingsHistory(): Promise<SettingsHistory[]> { try { return JSON.parse(await readFile(settingsHistoryPath(), "utf8")) as SettingsHistory[]; } catch { return []; } }
async function recordSettings(options: ConvertOptions): Promise<void> { const entries = await settingsHistory(); entries.unshift({ options, usedAt: new Date().toISOString() }); await mkdir(dirname(settingsHistoryPath()), { recursive: true }); await writeFile(settingsHistoryPath(), JSON.stringify(entries.slice(0, 10), null, 2)); }
async function chooseMarkdown(): Promise<{ path: string; content: string } | undefined> {
  const result = await dialog.showOpenDialog(mainWindow!, { title: "Markdown を開く", properties: ["openFile"], filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
  if (result.canceled || !result.filePaths[0]) return undefined;
  const path = result.filePaths[0]; const content = await readFile(path, "utf8"); await record({ path }); return { path, content };
}
async function chooseFolder(): Promise<{ path: string; content: string } | undefined> {
  const result = await dialog.showOpenDialog(mainWindow!, { title: "Markdown フォルダを開く", properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return undefined;
  const folder = result.filePaths[0];
  const entries = await readdir(folder, { withFileTypes: true });
  const markdown = entries.find(entry => entry.isFile() && /\.(?:md|markdown)$/i.test(entry.name));
  if (!markdown) { await dialog.showMessageBox(mainWindow!, { type: "info", message: "Markdownファイルが見つかりません", detail: "選択したフォルダの直下に .md または .markdown ファイルがありません。" }); return undefined; }
  const path = join(folder, markdown.name); const content = await readFile(path, "utf8"); await record({ path }); return { path, content };
}
function inspectMarkdown(content: string) {
  const outline: Array<{ level: number; text: string; line: number }> = [];
  const issues: Array<{ severity: "error" | "warning" | "info"; message: string; line: number; column: number }> = [];
  const assets: Array<{ path: string; line: number; kind: string }> = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.+)/.exec(line);
    if (heading) outline.push({ level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, ""), line: index + 1 });
    for (const match of line.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assets.push({ path: match[1], line: index + 1, kind: extname(match[1]).slice(1).toUpperCase() || "FILE" });
    if (/\bTODO\b/i.test(line)) issues.push({ severity: "info", message: "TODO が残っています", line: index + 1, column: line.search(/TODO/i) + 1 });
    if (/^#{1,6}(?!\s)/.test(line)) issues.push({ severity: "warning", message: "見出し記号の後に空白が必要です", line: index + 1, column: 1 });
  });
  if (!outline.length && content.trim()) issues.push({ severity: "info", message: "見出しがありません", line: 1, column: 1 });
  return { outline, issues, assets };
}
async function openEditor(path: string, line = 1, column = 1): Promise<{ ok: boolean; method?: string; message?: string }> {
  const target = `${path}:${line}:${column}`;
  try { await execFileAsync(process.env.INKFRAME_EDITOR || process.env.MDPDF_EDITOR || "code", ["-g", target]); return { ok: true, method: "code" }; } catch {}
  try { await shell.openExternal(`vscode://file/${encodeURI(path)}:${line}:${column}`); return { ok: true, method: "vscode-uri" }; } catch {}
  const error = await shell.openPath(path);
  return error ? { ok: false, message: `エディタで開けませんでした: ${error}` } : { ok: true, method: "system" };
}
function watchDocument(path?: string): void {
  activeWatcher?.close(); activeWatcher = undefined;
  if (!path) return;
  try {
    activeWatcher = watch(path, { persistent: false }, () => mainWindow?.webContents.send("document:changed", path));
    activeWatcher.on("error", () => mainWindow?.webContents.send("document:watch-error", path));
  } catch { mainWindow?.webContents.send("document:watch-error", path); }
}
function previewPath(path?: string): string { return join(path ? dirname(path) : app.getPath("temp"), `.inkframe-preview-${process.pid}-${randomUUID()}.md`); }
async function renderPdfPreview(content: string, activePath: string | undefined, options: ConvertOptions) {
  const inputPath = previewPath(activePath);
  const previewRoot = await mkdtemp(join(app.getPath("temp"), `inkframe-preview-${process.pid}-`));
  const pdfPath = join(previewRoot, "preview.pdf");
  const pagePrefix = join(previewRoot, "page");
  try {
    await writeFile(inputPath, content, "utf8");
    const frontmatter = matter(content).data as { title?: string };
    const previewOptions = !options.title && !frontmatter.title && activePath ? { ...options, title: basename(activePath) } : options;
    await convertMarkdown(inputPath, { ...previewOptions, output: pdfPath, compress: false, imageOptimize: false });
    try {
      await execFileAsync("pdftoppm", ["-png", "-r", "144", pdfPath, pagePrefix], { maxBuffer: 32 * 1024 * 1024 });
    } catch (error) {
      throw new Error(`PDFプレビューの画像化に失敗しました。Poppler（pdftoppm）が利用できるか確認してください。${error instanceof Error ? `\n${error.message}` : ""}`);
    }
    const pageFiles = (await readdir(previewRoot)).filter(name => /^page-\d+\.png$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const pages = await Promise.all(pageFiles.map(async name => `data:image/png;base64,${(await readFile(join(previewRoot, name))).toString("base64")}`));
    if (!pages.length) throw new Error("PDFプレビューのページを生成できませんでした。");
    return { pages, pageCount: pages.length };
  } finally {
    await Promise.all([rm(previewRoot, { recursive: true, force: true }), rm(inputPath, { force: true })]);
  }
}

app.whenReady().then(async () => {
  ipcMain.handle("document:open", chooseMarkdown);
  ipcMain.handle("folder:open", chooseFolder);
  ipcMain.handle("document:save", async (_event, path: string | undefined, content: string) => {
    let target = path;
    if (!target) { const result = await dialog.showSaveDialog(mainWindow!, { title: "Markdown を保存", defaultPath: "document.md", filters: [{ name: "Markdown", extensions: ["md"] }] }); if (result.canceled || !result.filePath) return undefined; target = result.filePath; }
    await writeFile(target, content, "utf8"); await record({ path: target }); return target;
  });
  ipcMain.handle("document:read", async (_event, path: string) => { const document = { path, content: await readFile(path, "utf8") }; watchDocument(path); return document; });
  ipcMain.handle("document:watch", (_event, path?: string) => { watchDocument(path); return Boolean(path); });
  ipcMain.handle("document:inspect", (_event, content: string) => inspectMarkdown(content));
  ipcMain.handle("preview:render", async (_event, content: string, activePath: string | undefined, options: ConvertOptions) => renderPdfPreview(content, activePath, options));
  ipcMain.handle("pdf:generate", async (_event, content: string, activePath: string | undefined, options: ConvertOptions) => {
    const inputPath = activePath ?? join(app.getPath("documents"), "inkframe-document.md"); await mkdir(dirname(inputPath), { recursive: true }); await writeFile(inputPath, content, "utf8");
    const result = await dialog.showSaveDialog(mainWindow!, { title: "PDF を保存", defaultPath: options.output ?? inputPath.replace(/\.(?:md|markdown)$/i, ".pdf"), filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (result.canceled || !result.filePath) return undefined;
    const outputPath = await convertMarkdown(inputPath, { ...options, output: result.filePath }); await record({ path: inputPath, outputPath }); await recordSettings(options);
    const info = await stat(outputPath);
    let pageCount: number | undefined;
    try { const { stdout } = await execFileAsync("pdfinfo", [outputPath]); pageCount = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]); } catch {}
    return { outputPath, fileName: basename(outputPath), fileSize: info.size, pageCount };
  });
  ipcMain.handle("editor:open", (_event, path: string, line?: number, column?: number) => openEditor(path, line, column));
  ipcMain.handle("file:reveal", (_event, path: string) => { shell.showItemInFolder(path); });
  ipcMain.handle("file:open", (_event, path: string) => shell.openPath(path));
  ipcMain.handle("clipboard:write", (_event, value: string) => clipboard.writeText(value));
  ipcMain.handle("fonts:list", listFonts); ipcMain.handle("themes:list", listThemes); ipcMain.handle("history:list", history);
  ipcMain.handle("templates:list", templates);
  ipcMain.handle("templates:save", async (_event, name: string, options: ConvertOptions) => {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || `template-${Date.now()}`;
    const values = (await templates()).filter((template) => template.id !== id);
    const template = { id, name: name.trim() || "無題のテンプレート", options, updatedAt: new Date().toISOString() };
    values.unshift(template); await writeTemplates(values); return template;
  });
  ipcMain.handle("templates:delete", async (_event, id: string) => { await writeTemplates((await templates()).filter((template) => template.id !== id)); });
  ipcMain.handle("settings-history:list", settingsHistory);
  mainWindow = new BrowserWindow({ width: 1500, height: 960, minWidth: 1100, minHeight: 700, title: "Inkframe", webPreferences: { contextIsolation: true, nodeIntegration: false, preload: resolve(import.meta.dirname, "../../desktop/preload.cjs") } });
  await mainWindow.loadFile(resolve(import.meta.dirname, "../../desktop/renderer-dist/index.html"));
});
app.on("window-all-closed", () => { activeWatcher?.close(); if (process.platform !== "darwin") app.quit(); });
