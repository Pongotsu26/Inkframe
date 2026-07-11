import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell } from "electron";
import matter from "gray-matter";
import { listFonts } from "../fonts.js";
import { inspectMarkdown } from "../markdown-inspection.js";
import { markdownToHtml } from "../html.js";
import { convertMarkdown, resolvedConfig, type ConvertOptions } from "../renderer.js";
import { listThemes, themeCssPath, type ThemeInfo } from "../themes.js";

interface HistoryItem { path: string; outputPath?: string; openedAt: string; }
interface Template { id: string; name: string; options: ConvertOptions; updatedAt: string; }
interface SettingsHistory { options: ConvertOptions; usedAt: string; }
interface AppSettings { defaultTheme?: string; }
let mainWindow: BrowserWindow | undefined;
let activeWatcher: FSWatcher | undefined;
const execFileAsync = promisify(execFile);
function historyPath(): string { return join(app.getPath("userData"), "history.json"); }
function templatesPath(): string { return join(app.getPath("userData"), "templates.json"); }
function settingsHistoryPath(): string { return join(app.getPath("userData"), "settings-history.json"); }
function customThemesPath(): string { return join(app.getPath("userData"), "themes"); }
function appSettingsPath(): string { return join(app.getPath("userData"), "settings.json"); }
async function appSettings(): Promise<AppSettings> { try { const settings = JSON.parse(await readFile(appSettingsPath(), "utf8")) as AppSettings; return { ...settings, defaultTheme: settings.defaultTheme || "github" }; } catch { return { defaultTheme: "github" }; } }
async function writeAppSettings(value: AppSettings): Promise<void> { await mkdir(dirname(appSettingsPath()), { recursive: true }); await writeFile(appSettingsPath(), JSON.stringify(value, null, 2)); }
function themeSlug(name: string): string { return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || `theme-${Date.now()}`; }
async function uniqueThemeDirectory(name: string): Promise<string> { const base = themeSlug(name); let suffix = 1; let target = join(customThemesPath(), base); while (true) { try { await stat(target); target = join(customThemesPath(), `${base}-${++suffix}`); } catch { return target; } } }
async function createCustomTheme(name: string, sourceTheme = "github"): Promise<ThemeInfo> {
  const target = await uniqueThemeDirectory(name); await mkdir(target, { recursive: true });
  await copyFile(themeCssPath(sourceTheme), join(target, "theme.css"));
  const metadata = { name: name.trim() || "新しいテーマ", description: "カスタムテーマ" };
  await writeFile(join(target, "theme.json"), JSON.stringify(metadata, null, 2));
  return { id: join(target, "theme.css"), ...metadata, custom: true, cssPath: join(target, "theme.css") };
}
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
async function openEditor(path: string, line = 1, column = 1): Promise<{ ok: boolean; method?: string; message?: string }> {
  const target = `${path}:${line}:${column}`;
  try { await execFileAsync(process.env.INKFRAME_EDITOR || process.env.MDPDF_EDITOR || "code", ["-g", target]); return { ok: true, method: "code" }; } catch { }
  try { await shell.openExternal(`vscode://file/${encodeURI(path)}:${line}:${column}`); return { ok: true, method: "vscode-uri" }; } catch { }
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
async function renderHtmlPreview(content: string, activePath: string | undefined, options: ConvertOptions) {
  const inputPath = previewPath(activePath);
  try {
    await writeFile(inputPath, content, "utf8");
    const frontmatter = matter(content).data as { title?: string };
    const previewOptions = !options.title && !frontmatter.title && activePath ? { ...options, title: basename(activePath) } : options;
    const settings = await resolvedConfig(inputPath, previewOptions);
    const document = await markdownToHtml(inputPath, settings);
    return {
      html: document.html,
      mermaidScriptUrl: pathToFileURL(document.mermaidScriptPath).href,
      paper: settings.paper ?? "A4",
      orientation: settings.orientation ?? "portrait",
      margin: settings.margin ?? "18mm"
    };
  } finally {
    await rm(inputPath, { force: true });
  }
}

app.whenReady().then(async () => {
  const iconPath = resolve(import.meta.dirname, "../../assets/icon.png");
  const appIcon = nativeImage.createFromPath(iconPath);
  // Development runs are hosted by Electron.app, so give them a useful Dock
  // icon. Packaged builds must keep the bundle-provided Assets.car icon; an
  // explicit setIcon() would replace the Liquid Glass icon only while running.
  if (process.platform === "darwin" && !app.isPackaged && !appIcon.isEmpty()) app.dock?.setIcon(appIcon);
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
  ipcMain.handle("preview:render", async (_event, content: string, activePath: string | undefined, options: ConvertOptions) => renderHtmlPreview(content, activePath, options));
  ipcMain.handle("pdf:generate", async (_event, content: string, activePath: string | undefined, options: ConvertOptions) => {
    const inputPath = activePath ?? join(app.getPath("documents"), "inkframe-document.md"); await mkdir(dirname(inputPath), { recursive: true }); await writeFile(inputPath, content, "utf8");
    const result = await dialog.showSaveDialog(mainWindow!, { title: "PDF を保存", defaultPath: options.output ?? inputPath.replace(/\.(?:md|markdown)$/i, ".pdf"), filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (result.canceled || !result.filePath) return undefined;
    const outputPath = await convertMarkdown(inputPath, { ...options, output: result.filePath }); await record({ path: inputPath, outputPath }); await recordSettings(options);
    const info = await stat(outputPath);
    let pageCount: number | undefined;
    try { const { stdout } = await execFileAsync("pdfinfo", [outputPath]); pageCount = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]); } catch { }
    return { outputPath, fileName: basename(outputPath), fileSize: info.size, pageCount };
  });
  ipcMain.handle("editor:open", (_event, path: string, line?: number, column?: number) => openEditor(path, line, column));
  ipcMain.handle("file:reveal", (_event, path: string) => { shell.showItemInFolder(path); });
  ipcMain.handle("file:open", (_event, path: string) => shell.openPath(path));
  ipcMain.handle("clipboard:write", (_event, value: string) => clipboard.writeText(value));
  ipcMain.handle("fonts:list", listFonts); ipcMain.handle("themes:list", () => listThemes(customThemesPath())); ipcMain.handle("history:list", history);
  ipcMain.handle("themes:create", async (_event, name: string, sourceTheme?: string) => createCustomTheme(name, sourceTheme));
  ipcMain.handle("themes:edit", async (_event, cssPath: string) => openEditor(cssPath));
  ipcMain.handle("themes:delete", async (_event, cssPath: string) => { const directory = dirname(cssPath); if (dirname(directory) !== customThemesPath()) throw new Error("カスタムテーマだけを削除できます"); await rm(directory, { recursive: true, force: true }); });
  ipcMain.handle("themes:export", async (_event, cssPath: string) => {
    const metadata = JSON.parse(await readFile(join(dirname(cssPath), "theme.json"), "utf8")); const css = await readFile(cssPath, "utf8");
    const result = await dialog.showSaveDialog(mainWindow!, { title: "テーマを書き出す", defaultPath: `${themeSlug(metadata.name)}.inkframe-theme.json`, filters: [{ name: "Inkframe Theme", extensions: ["json"] }] });
    if (result.canceled || !result.filePath) return false; await writeFile(result.filePath, JSON.stringify({ format: "inkframe-theme", version: 1, metadata, css }, null, 2)); return true;
  });
  ipcMain.handle("themes:import", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: "テーマを読み込む", properties: ["openFile"], filters: [{ name: "Inkframe Theme", extensions: ["json", "css"] }] }); if (result.canceled || !result.filePaths[0]) return undefined;
    const source = result.filePaths[0]; const raw = await readFile(source, "utf8"); let metadata: { name: string; description?: string }; let css: string;
    if (extname(source).toLowerCase() === ".css") { metadata = { name: basename(source, ".css"), description: "インポートしたテーマ" }; css = raw; }
    else { const bundle = JSON.parse(raw) as { format?: string; metadata?: { name?: string; description?: string }; css?: string }; if (bundle.format !== "inkframe-theme" || typeof bundle.css !== "string") throw new Error("Inkframeテーマファイルではありません"); metadata = { name: bundle.metadata?.name || basename(source, ".json"), description: bundle.metadata?.description }; css = bundle.css; }
    const target = await uniqueThemeDirectory(metadata.name); await mkdir(target, { recursive: true }); await writeFile(join(target, "theme.css"), css); await writeFile(join(target, "theme.json"), JSON.stringify(metadata, null, 2)); return { id: join(target, "theme.css"), ...metadata, custom: true, cssPath: join(target, "theme.css") };
  });
  ipcMain.handle("settings:get", appSettings);
  ipcMain.handle("settings:set-default-theme", async (_event, theme?: string) => { const settings = await appSettings(); settings.defaultTheme = theme; await writeAppSettings(settings); return settings; });
  ipcMain.handle("templates:list", templates);
  ipcMain.handle("templates:save", async (_event, name: string, options: ConvertOptions) => {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || `template-${Date.now()}`;
    const values = (await templates()).filter((template) => template.id !== id);
    const template = { id, name: name.trim() || "無題のテンプレート", options, updatedAt: new Date().toISOString() };
    values.unshift(template); await writeTemplates(values); return template;
  });
  ipcMain.handle("templates:delete", async (_event, id: string) => { await writeTemplates((await templates()).filter((template) => template.id !== id)); });
  ipcMain.handle("settings-history:list", settingsHistory);
  mainWindow = new BrowserWindow({ width: 1500, height: 960, minWidth: 1100, minHeight: 700, title: "Inkframe", icon: iconPath, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: resolve(import.meta.dirname, "../../desktop/preload.cjs") } });
  await mainWindow.loadFile(resolve(import.meta.dirname, "../../desktop/renderer-dist/index.html"));
});
app.on("window-all-closed", () => { activeWatcher?.close(); if (process.platform !== "darwin") app.quit(); });
