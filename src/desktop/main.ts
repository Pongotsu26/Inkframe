import {
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import matter from "gray-matter";
import { listFonts } from "../fonts.js";
import { inspectMarkdown } from "../markdown-inspection.js";
import { markdownToHtml } from "../html.js";
import {
  convertMarkdown,
  resolvedConfig,
  type ConvertOptions,
} from "../renderer.js";
import { listThemes, themeCssPath, type ThemeInfo } from "../themes.js";

interface HistoryItem {
  path: string;
  outputPath?: string;
  openedAt: string;
}
interface Template {
  id: string;
  name: string;
  options: ConvertOptions;
  updatedAt: string;
}
interface SettingsHistory {
  options: ConvertOptions;
  usedAt: string;
}
interface AppSettings {
  defaultTheme?: string;
  defaultOptions?: ConvertOptions;
}
interface WindowState {
  bounds?: { width: number; height: number; x?: number; y?: number };
  maximized?: boolean;
}
let mainWindow: BrowserWindow | undefined;
let activeWatcher: FSWatcher | undefined;
let currentMenuDocumentOptions: Pick<
  ConvertOptions,
  "toc" | "cover" | "pageNumber"
> = {};
const execFileAsync = promisify(execFile);
function historyPath(): string {
  return join(app.getPath("userData"), "history.json");
}
function templatesPath(): string {
  return join(app.getPath("userData"), "templates.json");
}
function settingsHistoryPath(): string {
  return join(app.getPath("userData"), "settings-history.json");
}
function customThemesPath(): string {
  return join(app.getPath("userData"), "themes");
}
function appSettingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}
function windowStatePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}
function readWindowState(): WindowState {
  try {
    return JSON.parse(readFileSync(windowStatePath(), "utf8")) as WindowState;
  } catch {
    return {};
  }
}
function saveWindowState(window: BrowserWindow): void {
  const state: WindowState = {
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized(),
  };
  mkdirSync(dirname(windowStatePath()), { recursive: true });
  writeFileSync(windowStatePath(), JSON.stringify(state, null, 2));
}
async function appSettings(): Promise<AppSettings> {
  try {
    const settings = JSON.parse(
      await readFile(appSettingsPath(), "utf8"),
    ) as AppSettings;
    return { ...settings, defaultTheme: settings.defaultTheme || "github" };
  } catch {
    return { defaultTheme: "github" };
  }
}
async function writeAppSettings(value: AppSettings): Promise<void> {
  await mkdir(dirname(appSettingsPath()), { recursive: true });
  await writeFile(appSettingsPath(), JSON.stringify(value, null, 2));
}
function themeSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "") || `theme-${Date.now()}`
  );
}
async function uniqueThemeDirectory(name: string): Promise<string> {
  const base = themeSlug(name);
  let suffix = 1;
  let target = join(customThemesPath(), base);
  while (true) {
    try {
      await stat(target);
      target = join(customThemesPath(), `${base}-${++suffix}`);
    } catch {
      return target;
    }
  }
}
async function createCustomTheme(
  name: string,
  sourceTheme = "github",
): Promise<ThemeInfo> {
  const target = await uniqueThemeDirectory(name);
  await mkdir(target, { recursive: true });
  await copyFile(themeCssPath(sourceTheme), join(target, "theme.css"));
  const metadata = {
    name: name.trim() || "新しいテーマ",
    description: "カスタムテーマ",
  };
  await writeFile(
    join(target, "theme.json"),
    JSON.stringify(metadata, null, 2),
  );
  return {
    id: join(target, "theme.css"),
    ...metadata,
    custom: true,
    cssPath: join(target, "theme.css"),
  };
}
async function history(): Promise<HistoryItem[]> {
  try {
    return JSON.parse(await readFile(historyPath(), "utf8")) as HistoryItem[];
  } catch {
    return [];
  }
}
async function record(item: Omit<HistoryItem, "openedAt">): Promise<void> {
  const entries = (await history()).filter((entry) => entry.path !== item.path);
  entries.unshift({ ...item, openedAt: new Date().toISOString() });
  await mkdir(dirname(historyPath()), { recursive: true });
  await writeFile(historyPath(), JSON.stringify(entries.slice(0, 20), null, 2));
  if (app.isReady()) void installApplicationMenu();
}
async function templates(): Promise<Template[]> {
  try {
    return JSON.parse(await readFile(templatesPath(), "utf8")) as Template[];
  } catch {
    return [];
  }
}
async function writeTemplates(values: Template[]): Promise<void> {
  await mkdir(dirname(templatesPath()), { recursive: true });
  await writeFile(templatesPath(), JSON.stringify(values, null, 2));
}
async function settingsHistory(): Promise<SettingsHistory[]> {
  try {
    return JSON.parse(
      await readFile(settingsHistoryPath(), "utf8"),
    ) as SettingsHistory[];
  } catch {
    return [];
  }
}
async function recordSettings(options: ConvertOptions): Promise<void> {
  const entries = await settingsHistory();
  entries.unshift({ options, usedAt: new Date().toISOString() });
  await mkdir(dirname(settingsHistoryPath()), { recursive: true });
  await writeFile(
    settingsHistoryPath(),
    JSON.stringify(entries.slice(0, 10), null, 2),
  );
}
async function chooseMarkdown(): Promise<
  { path: string; content: string } | undefined
> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Markdown を開く",
    properties: ["openFile"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });
  if (result.canceled || !result.filePaths[0]) return undefined;
  const path = result.filePaths[0];
  const content = await readFile(path, "utf8");
  await record({ path });
  return { path, content };
}
async function chooseFolder(): Promise<
  { path: string; content: string } | undefined
> {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: "Markdown フォルダを開く",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return undefined;
  const folder = result.filePaths[0];
  const entries = await readdir(folder, { withFileTypes: true });
  const markdown = entries.find(
    (entry) => entry.isFile() && /\.(?:md|markdown)$/i.test(entry.name),
  );
  if (!markdown) {
    await dialog.showMessageBox(mainWindow!, {
      type: "info",
      message: "Markdownファイルが見つかりません",
      detail:
        "選択したフォルダの直下に .md または .markdown ファイルがありません。",
    });
    return undefined;
  }
  const path = join(folder, markdown.name);
  const content = await readFile(path, "utf8");
  await record({ path });
  return { path, content };
}
async function openEditor(
  path: string,
  line = 1,
  column = 1,
): Promise<{ ok: boolean; method?: string; message?: string }> {
  const target = `${path}:${line}:${column}`;
  try {
    await execFileAsync(
      process.env.INKFRAME_EDITOR || process.env.MDPDF_EDITOR || "code",
      ["-g", target],
    );
    return { ok: true, method: "code" };
  } catch {}
  try {
    await shell.openExternal(
      `vscode://file/${encodeURI(path)}:${line}:${column}`,
    );
    return { ok: true, method: "vscode-uri" };
  } catch {}
  const error = await shell.openPath(path);
  return error
    ? { ok: false, message: `エディタで開けませんでした: ${error}` }
    : { ok: true, method: "system" };
}
function watchDocument(path?: string): void {
  activeWatcher?.close();
  activeWatcher = undefined;
  if (!path) return;
  try {
    activeWatcher = watch(path, { persistent: false }, () =>
      mainWindow?.webContents.send("document:changed", path),
    );
    activeWatcher.on("error", () =>
      mainWindow?.webContents.send("document:watch-error", path),
    );
  } catch {
    mainWindow?.webContents.send("document:watch-error", path);
  }
}
function previewPath(path?: string): string {
  return join(
    path ? dirname(path) : app.getPath("temp"),
    `.inkframe-preview-${process.pid}-${randomUUID()}.md`,
  );
}
async function renderHtmlPreview(
  content: string,
  activePath: string | undefined,
  options: ConvertOptions,
) {
  const inputPath = previewPath(activePath);
  try {
    await writeFile(inputPath, content, "utf8");
    const frontmatter = matter(content).data as { title?: string };
    const previewOptions =
      !options.title && !frontmatter.title && activePath
        ? { ...options, title: basename(activePath) }
        : options;
    const settings = await resolvedConfig(inputPath, previewOptions);
    const document = await markdownToHtml(inputPath, settings);
    return {
      html: document.html,
      mermaidScriptUrl: pathToFileURL(document.mermaidScriptPath).href,
      paper: settings.paper ?? "A4",
      orientation: settings.orientation ?? "portrait",
      margin: settings.margin ?? "18mm",
      pageNumber: Boolean(settings.pageNumber),
      pageNumberFormat: settings.pageNumberFormat ?? "current-total",
      pageNumberFont:
        settings.pageNumberFont?.face ?? settings.pageNumberFont?.family,
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
  if (process.platform === "darwin" && !app.isPackaged && !appIcon.isEmpty())
    app.dock?.setIcon(appIcon);
  ipcMain.handle("document:open", chooseMarkdown);
  ipcMain.handle("folder:open", chooseFolder);
  ipcMain.handle(
    "document:save",
    async (_event, path: string | undefined, content: string) => {
      let target = path;
      if (!target) {
        const result = await dialog.showSaveDialog(mainWindow!, {
          title: "Markdown を保存",
          defaultPath: "document.md",
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (result.canceled || !result.filePath) return undefined;
        target = result.filePath;
      }
      await writeFile(target, content, "utf8");
      await record({ path: target });
      return target;
    },
  );
  ipcMain.handle("document:read", async (_event, path: string) => {
    const document = { path, content: await readFile(path, "utf8") };
    await record({ path });
    watchDocument(path);
    return document;
  });
  ipcMain.handle("document:watch", (_event, path?: string) => {
    watchDocument(path);
    return Boolean(path);
  });
  ipcMain.handle("document:inspect", (_event, content: string) =>
    inspectMarkdown(content),
  );
  ipcMain.handle(
    "preview:render",
    async (
      _event,
      content: string,
      activePath: string | undefined,
      options: ConvertOptions,
    ) => renderHtmlPreview(content, activePath, options),
  );
  ipcMain.handle(
    "pdf:generate",
    async (
      _event,
      content: string,
      activePath: string | undefined,
      options: ConvertOptions,
    ) => {
      const inputPath =
        activePath ?? join(app.getPath("documents"), "inkframe-document.md");
      await mkdir(dirname(inputPath), { recursive: true });
      await writeFile(inputPath, content, "utf8");
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: "PDF を保存",
        defaultPath:
          options.output ?? inputPath.replace(/\.(?:md|markdown)$/i, ".pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (result.canceled || !result.filePath) return undefined;
      const outputPath = await convertMarkdown(inputPath, {
        ...options,
        output: result.filePath,
      });
      await record({ path: inputPath, outputPath });
      await recordSettings(options);
      const info = await stat(outputPath);
      let pageCount: number | undefined;
      try {
        const { stdout } = await execFileAsync("pdfinfo", [outputPath]);
        pageCount = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
      } catch {}
      return {
        outputPath,
        fileName: basename(outputPath),
        fileSize: info.size,
        pageCount,
      };
    },
  );
  ipcMain.handle(
    "editor:open",
    (_event, path: string, line?: number, column?: number) =>
      openEditor(path, line, column),
  );
  ipcMain.handle("file:reveal", (_event, path: string) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle("file:open", (_event, path: string) => shell.openPath(path));
  ipcMain.handle("clipboard:write", (_event, value: string) =>
    clipboard.writeText(value),
  );
  ipcMain.handle("fonts:list", listFonts);
  ipcMain.handle("themes:list", () => listThemes(customThemesPath()));
  ipcMain.handle("history:list", history);
  ipcMain.handle(
    "themes:create",
    async (_event, name: string, sourceTheme?: string) =>
      createCustomTheme(name, sourceTheme),
  );
  ipcMain.handle("themes:edit", async (_event, cssPath: string) =>
    openEditor(cssPath),
  );
  ipcMain.handle("themes:delete", async (_event, cssPath: string) => {
    const directory = dirname(cssPath);
    if (dirname(directory) !== customThemesPath())
      throw new Error("カスタムテーマだけを削除できます");
    await rm(directory, { recursive: true, force: true });
  });
  ipcMain.handle("themes:export", async (_event, cssPath: string) => {
    const metadata = JSON.parse(
      await readFile(join(dirname(cssPath), "theme.json"), "utf8"),
    );
    const css = await readFile(cssPath, "utf8");
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "テーマを書き出す",
      defaultPath: `${themeSlug(metadata.name)}.inkframe-theme.json`,
      filters: [{ name: "Inkframe Theme", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(
      result.filePath,
      JSON.stringify(
        { format: "inkframe-theme", version: 1, metadata, css },
        null,
        2,
      ),
    );
    return true;
  });
  ipcMain.handle("themes:import", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "テーマを読み込む",
      properties: ["openFile"],
      filters: [{ name: "Inkframe Theme", extensions: ["json", "css"] }],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    const source = result.filePaths[0];
    const raw = await readFile(source, "utf8");
    let metadata: { name: string; description?: string };
    let css: string;
    if (extname(source).toLowerCase() === ".css") {
      metadata = {
        name: basename(source, ".css"),
        description: "インポートしたテーマ",
      };
      css = raw;
    } else {
      const bundle = JSON.parse(raw) as {
        format?: string;
        metadata?: { name?: string; description?: string };
        css?: string;
      };
      if (bundle.format !== "inkframe-theme" || typeof bundle.css !== "string")
        throw new Error("Inkframeテーマファイルではありません");
      metadata = {
        name: bundle.metadata?.name || basename(source, ".json"),
        description: bundle.metadata?.description,
      };
      css = bundle.css;
    }
    const target = await uniqueThemeDirectory(metadata.name);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "theme.css"), css);
    await writeFile(
      join(target, "theme.json"),
      JSON.stringify(metadata, null, 2),
    );
    return {
      id: join(target, "theme.css"),
      ...metadata,
      custom: true,
      cssPath: join(target, "theme.css"),
    };
  });
  ipcMain.handle("settings:get", appSettings);
  ipcMain.handle(
    "settings:set-default-theme",
    async (_event, theme?: string) => {
      const settings = await appSettings();
      settings.defaultTheme = theme;
      await writeAppSettings(settings);
      return settings;
    },
  );
  ipcMain.handle(
    "settings:set-default-options",
    async (_event, defaultOptions: ConvertOptions) => {
      const settings = await appSettings();
      settings.defaultOptions = defaultOptions;
      settings.defaultTheme = defaultOptions.theme ?? settings.defaultTheme;
      await writeAppSettings(settings);
      return settings;
    },
  );
  ipcMain.handle("templates:list", templates);
  ipcMain.handle(
    "templates:save",
    async (_event, name: string, options: ConvertOptions) => {
      const id =
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-") || `template-${Date.now()}`;
      const values = (await templates()).filter(
        (template) => template.id !== id,
      );
      const template = {
        id,
        name: name.trim() || "無題のテンプレート",
        options,
        updatedAt: new Date().toISOString(),
      };
      values.unshift(template);
      await writeTemplates(values);
      return template;
    },
  );
  ipcMain.handle("templates:delete", async (_event, id: string) => {
    await writeTemplates(
      (await templates()).filter((template) => template.id !== id),
    );
  });
  ipcMain.handle("settings-history:list", settingsHistory);
  ipcMain.handle(
    "menu:document-options",
    (_event, options: Pick<ConvertOptions, "toc" | "cover" | "pageNumber">) => {
      currentMenuDocumentOptions = options;
      const menu = Menu.getApplicationMenu();
      const values = {
        "document-toc": options.toc,
        "document-cover": options.cover,
        "document-page-number": options.pageNumber,
      };
      for (const [id, checked] of Object.entries(values)) {
        const item = menu?.getMenuItemById(id);
        if (item) item.checked = Boolean(checked);
      }
    },
  );
  await createMainWindow(iconPath);
});

async function createMainWindow(iconPath?: string): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const windowState = readWindowState();
  const bounds = windowState.bounds;
  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1500,
    height: bounds?.height ?? 960,
    ...(bounds?.x === undefined ? {} : { x: bounds.x }),
    ...(bounds?.y === undefined ? {} : { y: bounds.y }),
    minWidth: 1100,
    minHeight: 700,
    title: "",
    backgroundColor: "#121314",
    icon: iconPath ?? resolve(import.meta.dirname, "../../assets/icon.png"),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolve(import.meta.dirname, "../../desktop/preload.cjs"),
    },
  });
  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    mainWindow?.setTitle("");
  });
  mainWindow.on("close", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    saveWindowState(mainWindow);
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  if (windowState.maximized) mainWindow.maximize();
  await installApplicationMenu();
  await mainWindow.loadFile(
    resolve(import.meta.dirname, "../../desktop/renderer-dist/index.html"),
  );
}

function sendMenuAction(action: string, value?: unknown): void {
  mainWindow?.webContents.send("menu:action", action, value);
}

async function installApplicationMenu(): Promise<void> {
  const recent = await history();
  const themes = await listThemes(customThemesPath());
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const, label: "Inkframe について" },
              {
                label: "アップデートを確認…",
                click: () =>
                  shell.openExternal(
                    "https://github.com/Pongotsu26/Inkframe/releases/latest",
                  ),
              },
              { type: "separator" as const },
              {
                label: "設定…",
                accelerator: "CommandOrControl+,",
                click: () => mainWindow?.webContents.send("settings:open"),
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "ファイル",
      submenu: [
        {
          label: "新しいタブ",
          accelerator: "CommandOrControl+T",
          click: () => sendMenuAction("new-tab"),
        },
        {
          label: "Markdown を開く…",
          accelerator: "CommandOrControl+O",
          click: () => sendMenuAction("open"),
        },
        {
          label: "最近使った項目",
          submenu: recent.length
            ? recent.map((item) => ({
                label: basename(item.path),
                sublabel: item.path,
                click: () => sendMenuAction("open-recent", item.path),
              }))
            : [{ label: "最近使った項目はありません", enabled: false }],
        },
        { type: "separator" },
        {
          label: "PDF を書き出す…",
          accelerator: "Shift+CommandOrControl+E",
          click: () => sendMenuAction("export"),
        },
        { type: "separator" },
        {
          label: "外部エディタで開く",
          accelerator: "Alt+CommandOrControl+O",
          click: () => sendMenuAction("open-editor"),
        },
        {
          label: "Finder に表示",
          accelerator: "Alt+CommandOrControl+R",
          click: () => sendMenuAction("reveal"),
        },
        { type: "separator" },
        { role: "close", label: "ウインドウを閉じる" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { role: "undo", label: "取り消す" },
        { role: "redo", label: "やり直す" },
        { type: "separator" },
        { role: "cut", label: "カット" },
        { role: "copy", label: "コピー" },
        { role: "paste", label: "ペースト" },
        { role: "selectAll", label: "すべて選択" },
      ],
    },
    {
      label: "表示",
      submenu: [
        {
          label: "拡大",
          accelerator: "CommandOrControl+Plus",
          click: () => sendMenuAction("zoom-in"),
        },
        {
          label: "縮小",
          accelerator: "CommandOrControl+-",
          click: () => sendMenuAction("zoom-out"),
        },
        {
          label: "実際のサイズ",
          accelerator: "CommandOrControl+1",
          click: () => sendMenuAction("zoom-actual"),
        },
        {
          label: "横幅に合わせる",
          accelerator: "CommandOrControl+2",
          click: () => sendMenuAction("zoom-fit"),
        },
        { role: "togglefullscreen", label: "フルスクリーン" },
      ],
    },
    {
      label: "文書",
      submenu: [
        {
          id: "document-toc",
          label: "目次を有効化",
          type: "checkbox",
          checked: Boolean(currentMenuDocumentOptions.toc),
          click: (item) =>
            sendMenuAction("toggle-option", {
              key: "toc",
              value: item.checked,
            }),
        },
        {
          id: "document-cover",
          label: "表紙を有効化",
          type: "checkbox",
          checked: Boolean(currentMenuDocumentOptions.cover),
          click: (item) =>
            sendMenuAction("toggle-option", {
              key: "cover",
              value: item.checked,
            }),
        },
        {
          id: "document-page-number",
          label: "ページ番号を有効化",
          type: "checkbox",
          checked: Boolean(currentMenuDocumentOptions.pageNumber),
          click: (item) =>
            sendMenuAction("toggle-option", {
              key: "pageNumber",
              value: item.checked,
            }),
        },
        { type: "separator" },
        {
          label: "文書設定を開く…",
          click: () => sendMenuAction("document-settings"),
        },
      ],
    },
    {
      label: "テーマ",
      submenu: [
        {
          label: "テーマを選択",
          submenu: themes.map((theme) => ({
            label: theme.name,
            click: () => sendMenuAction("select-theme", theme.id),
          })),
        },
        { type: "separator" },
        { label: "新しいテーマ…", click: () => sendMenuAction("theme-create") },
        {
          label: "テーマを読み込む…",
          click: () => sendMenuAction("theme-import"),
        },
        {
          label: "現在のテーマを書き出す…",
          click: () => sendMenuAction("theme-export"),
        },
        {
          label: "現在のテーマを編集",
          click: () => sendMenuAction("theme-edit"),
        },
        { label: "テーマを管理…", click: () => sendMenuAction("theme-manage") },
      ],
    },
    {
      label: "ウインドウ",
      submenu: [
        { role: "minimize", label: "しまう" },
        { role: "zoom", label: "拡大／縮小" },
        { type: "separator" },
        {
          label: "次のタブを表示",
          accelerator: "Control+Tab",
          click: () => sendMenuAction("next-tab"),
        },
        {
          label: "前のタブを表示",
          accelerator: "Control+Shift+Tab",
          click: () => sendMenuAction("previous-tab"),
        },
        {
          label: "すべてのタブを表示",
          click: () => sendMenuAction("show-tabs"),
        },
        { role: "front", label: "すべてを手前に移動" },
      ],
    },
    {
      role: "help",
      label: "ヘルプ",
      submenu: [
        {
          label: "Inkframe ヘルプ",
          click: () =>
            shell.openExternal("https://github.com/Pongotsu26/Inkframe#readme"),
        },
        {
          label: "Markdown 記法リファレンス",
          click: () => shell.openExternal("https://commonmark.org/help/"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("activate", () => {
  if (!mainWindow) void createMainWindow();
  else mainWindow.show();
});
app.on("window-all-closed", () => {
  activeWatcher?.close();
  if (process.platform !== "darwin") app.quit();
});
