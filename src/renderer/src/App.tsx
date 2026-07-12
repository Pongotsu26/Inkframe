import { useCallback, useEffect, useRef, useState } from "react";
import pagedPolyfillSource from "virtual:pagedjs-polyfill";
import type {
  AppSettings,
  ConvertOptions,
  DocumentFile,
  ExportResult,
  FontFamily,
  HistoryItem,
  Inspection,
  PreviewHtml,
  Theme,
} from "./types";

const PAGED_POLYFILL_URL = URL.createObjectURL(
  new Blob([pagedPolyfillSource], { type: "text/javascript" }),
);

const EMPTY_INSPECTION: Inspection = { outline: [], issues: [], assets: [] };
const DEFAULT_CODE_THEME = "github-dark";
const PREVIEW_ZOOM_STORAGE_KEY = "inkframe:preview-zoom";
const CODE_THEMES = [
  { id: "github-dark", name: "GitHub Dark" },
  { id: "light-plus", name: "Light Plus" },
  { id: "dark-plus", name: "Dark Plus" },
  { id: "github-light", name: "GitHub Light" },
  { id: "nord", name: "Nord" },
  { id: "one-dark-pro", name: "One Dark Pro" },
  { id: "dracula", name: "Dracula" },
];
const DEFAULT_OPTIONS: ConvertOptions = {
  theme: "github",
  codeTheme: DEFAULT_CODE_THEME,
  paper: "A4",
  margin: "18mm",
  orientation: "portrait",
  toc: false,
  pageNumber: true,
  pageNumberFormat: "current-total",
  cover: false,
  font: {},
  fontSize: { body: 10.5 },
};
function savedPreviewZoom(): number | undefined {
  const value = Number(window.localStorage.getItem(PREVIEW_ZOOM_STORAGE_KEY));
  return Number.isFinite(value) && value >= 40 && value <= 200
    ? value
    : undefined;
}
type InspectorTab = "Style" | "Layout" | "Font" | "Export";
type SideSection = "Source" | "Outline" | "Issues" | "Assets" | "History";

function Button({
  children,
  primary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button className={primary ? "button primary" : "button"} {...props}>
      {children}
    </button>
  );
}
function Segmented({
  value,
  values,
  onChange,
}: {
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented">
      {values.map((item) => (
        <button
          type="button"
          className={value === item ? "selected" : ""}
          onClick={() => onChange(item)}
          key={item}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="setting-card">
      <div className="card-heading">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {children}
    </section>
  );
}

function Home({
  history,
  themes,
  settings,
  showAddButton = true,
  onOpen,
  onOpenFolder,
  onRecent,
  onDrop,
  onCreateTheme,
  onImportTheme,
  onEditTheme,
  onExportTheme,
  onDeleteTheme,
  onDefaultTheme,
}: {
  history: HistoryItem[];
  themes: Theme[];
  settings: AppSettings;
  showAddButton?: boolean;
  onOpen: () => void;
  onOpenFolder: () => void;
  onRecent: (path: string) => void;
  onDrop: (file: File) => void;
  onCreateTheme: () => void;
  onImportTheme: () => void;
  onEditTheme: (theme: Theme) => void;
  onExportTheme: (theme: Theme) => void;
  onDeleteTheme: (theme: Theme) => void;
  onDefaultTheme: (theme: Theme) => void;
}) {
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onDrop(file);
  };
  return (
    <main className={`home ${showAddButton ? "standalone-home" : ""}`}>
      {showAddButton && (
        <button
          className="home-add-document"
          onClick={onOpen}
          title="Markdownを追加"
          aria-label="Markdownを追加"
        >
          <span>＋</span>
        </button>
      )}
      <div className="home-content">
        <div className="brand-mark">I</div>
        <h1>Inkframe</h1>
        <p>Markdownを、読みやすく美しいPDFへ仕上げるローカル組版スタジオ。</p>
        <div className="home-actions">
          <Button primary onClick={onOpen}>
            Markdownファイルを開く
          </Button>
          <Button onClick={onOpenFolder}>フォルダを開く</Button>
        </div>
        <button
          type="button"
          className="drop-zone"
          onClick={onOpen}
          onDragOver={(event) => event.preventDefault()}
          onDrop={drop}
        >
          Markdownをここにドロップ<span>.md / .markdown</span>
        </button>
        {history.length > 0 && (
          <section className="home-section">
            <h2>最近の文書</h2>
            <div className="recent-list">
              {history.slice(0, 16).map((item) => (
                <button key={item.path} onClick={() => onRecent(item.path)}>
                  <strong>{item.path.split("/").pop()}</strong>
                  <span>{item.path}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="home-section">
          <div className="home-section-heading">
            <h2>テーマ</h2>
            <div className="theme-toolbar">
              <Button onClick={onCreateTheme}>テーマを追加</Button>
              <Button onClick={onImportTheme}>読み込む</Button>
            </div>
          </div>
          <div className="home-theme-grid">
            {themes.map((theme, index) => (
              <ThemeCard
                theme={theme}
                index={index}
                selected={false}
                isDefault={settings.defaultTheme === theme.id}
                onSelect={() => undefined}
                onDefault={() => onDefaultTheme(theme)}
                onEdit={() => onEditTheme(theme)}
                onExport={() => onExportTheme(theme)}
                onDelete={() => onDeleteTheme(theme)}
                key={theme.id}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ThemeCard({
  theme,
  index,
  selected,
  isDefault,
  onSelect,
  onDefault,
  onEdit,
  onExport,
  onDelete,
}: {
  theme: Theme;
  index: number;
  selected: boolean;
  isDefault: boolean;
  onSelect: () => void;
  onDefault: () => void;
  onEdit: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`theme-card ${selected ? "selected" : ""}`}>
      <button
        className={`default-theme-star ${isDefault ? "active" : ""}`}
        title={isDefault ? "既定のテーマ" : "既定のテーマに設定"}
        aria-label={
          isDefault
            ? `${theme.name}は既定のテーマです`
            : `${theme.name}を既定のテーマに設定`
        }
        onClick={onDefault}
      >
        ★
      </button>
      <button className="theme-select" onClick={onSelect}>
        <span className={`theme-thumb thumb-${index % 3}`}>
          <i />
          <i />
          <i />
        </span>
        <strong>{theme.name}</strong>
        <small>
          {theme.custom ? "カスタムCSS" : theme.description || "組み込みテーマ"}
        </small>
      </button>
      {theme.custom && (
        <div className="theme-actions">
          <button onClick={onEdit}>編集</button>
          <button onClick={onExport}>書出</button>
          <button className="danger-action" onClick={onDelete}>
            削除
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar({
  path,
  documents,
  status,
  watchStatus,
  onAdd,
  onSelect,
  onClose,
  onOpenEditor,
  onReveal,
  onRefresh,
  onExport,
  leftPaneOpen,
  rightPaneOpen,
  onToggleLeftPane,
  onToggleRightPane,
}: {
  path: string;
  documents: DocumentFile[];
  status: string;
  watchStatus: string;
  onAdd: () => void;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onOpenEditor: () => void;
  onReveal: () => void;
  onRefresh: () => void;
  onExport: () => void;
  leftPaneOpen: boolean;
  rightPaneOpen: boolean;
  onToggleLeftPane: () => void;
  onToggleRightPane: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="add-document"
          onClick={onAdd}
          title="Markdownを追加"
          aria-label="Markdownを追加"
        >
          ＋
        </button>
        <span className="app-name">Inkframe</span>
        <div className="document-tabs" role="tablist">
          {documents.map((document) => (
            <div
              className={`document-tab ${document.path === path ? "active" : ""}`}
              role="tab"
              aria-selected={document.path === path}
              key={document.path}
            >
              <button
                className="tab-select"
                onClick={() => onSelect(document.path)}
                title={document.path}
              >
                {document.path.split("/").pop()}
              </button>
              <button
                className="tab-close"
                onClick={() => onClose(document.path)}
                title="タブを閉じる"
                aria-label={`${document.path.split("/").pop()}を閉じる`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="topbar-status">
          <span
            className={`status-dot ${watchStatus === "監視中" ? "online" : ""}`}
          />
          <span className="status-text">{watchStatus}</span>
          <span className="render-status">{status}</span>
        </div>
      </div>
      <div className="topbar-actions">
        <Button onClick={onOpenEditor}>VS Codeで開く</Button>
        <Button onClick={onReveal}>Finderに表示</Button>
        <Button onClick={onRefresh}>プレビュー更新</Button>
        <Button primary onClick={onExport}>
          PDFを書き出す
        </Button>
        <div className="pane-toggles">
          <button
            className={leftPaneOpen ? "pane-toggle active" : "pane-toggle"}
            onClick={onToggleLeftPane}
            title={leftPaneOpen ? "左ペインを閉じる" : "左ペインを開く"}
            aria-label={leftPaneOpen ? "左ペインを閉じる" : "左ペインを開く"}
            aria-pressed={leftPaneOpen}
          >
            ◧
          </button>
          <button
            className={
              rightPaneOpen ? "pane-toggle active right" : "pane-toggle right"
            }
            onClick={onToggleRightPane}
            title={rightPaneOpen ? "右ペインを閉じる" : "右ペインを開く"}
            aria-label={rightPaneOpen ? "右ペインを閉じる" : "右ペインを開く"}
            aria-pressed={rightPaneOpen}
          >
            ◨
          </button>
        </div>
      </div>
    </header>
  );
}

function LeftSidebar({
  document,
  inspection,
  history,
  active,
  onActive,
  onOpenLine,
  onHistory,
}: {
  document: DocumentFile;
  inspection: Inspection;
  history: HistoryItem[];
  active: SideSection;
  onActive: (value: SideSection) => void;
  onOpenLine: (line: number, column?: number) => void;
  onHistory: (path: string) => void;
}) {
  const sections: SideSection[] = [
    "Source",
    "Outline",
    "Issues",
    "Assets",
    "History",
  ];
  return (
    <aside className="left-sidebar">
      <nav className="side-tabs">
        {sections.map((section) => (
          <button
            className={active === section ? "selected" : ""}
            onClick={() => onActive(section)}
            key={section}
          >
            <span>{section}</span>
            {section === "Issues" && inspection.issues.length > 0 && (
              <b>{inspection.issues.length}</b>
            )}
          </button>
        ))}
      </nav>
      <div className="side-content">
        {active === "Source" && (
          <>
            <div className="section-label">開いている文書</div>
            <button className="source-file selected">
              <span>MD</span>
              <div>
                <strong>{document.path.split("/").pop()}</strong>
                <small>{document.path}</small>
              </div>
            </button>
            <div className="source-meta">
              <span>{document.content.split(/\r?\n/).length} lines</span>
              <span>{document.content.length.toLocaleString()} chars</span>
            </div>
          </>
        )}
        {active === "Outline" && (
          <>
            <div className="section-label">DOCUMENT OUTLINE</div>
            {inspection.outline.length ? (
              inspection.outline.map((item) => (
                <button
                  className="tree-item"
                  style={{ paddingLeft: 12 + (item.level - 1) * 14 }}
                  onClick={() => onOpenLine(item.line)}
                  key={`${item.line}-${item.text}`}
                >
                  <span className="hash">H{item.level}</span>
                  {item.text}
                </button>
              ))
            ) : (
              <Empty label="見出しがありません" />
            )}
          </>
        )}
        {active === "Issues" && (
          <>
            <div className="section-label">DOCUMENT ISSUES</div>
            {inspection.issues.length ? (
              inspection.issues.map((issue, index) => (
                <button
                  className="issue"
                  onClick={() => onOpenLine(issue.line, issue.column)}
                  key={`${issue.line}-${index}`}
                >
                  <span className={`severity ${issue.severity}`} />
                  <div>
                    <strong>{issue.message}</strong>
                    <small>
                      行 {issue.line}, 列 {issue.column} · VS Codeで開く
                    </small>
                  </div>
                </button>
              ))
            ) : (
              <Empty label="問題は見つかりませんでした" success />
            )}
          </>
        )}
        {active === "Assets" && (
          <>
            <div className="section-label">LINKED ASSETS</div>
            {inspection.assets.length ? (
              inspection.assets.map((asset) => (
                <button
                  className="asset"
                  onClick={() => onOpenLine(asset.line)}
                  key={`${asset.line}-${asset.path}`}
                >
                  <span>{asset.kind}</span>
                  <div>
                    <strong>{asset.path.split("/").pop()}</strong>
                    <small>{asset.path}</small>
                  </div>
                </button>
              ))
            ) : (
              <Empty label="画像や添付ファイルはありません" />
            )}
          </>
        )}
        {active === "History" && (
          <>
            <div className="section-label">RECENT DOCUMENTS</div>
            {history.length ? (
              history.map((item) => (
                <button
                  className="history-item"
                  onClick={() => onHistory(item.path)}
                  key={item.path}
                >
                  <strong>{item.path.split("/").pop()}</strong>
                  <small>{new Date(item.openedAt).toLocaleString()}</small>
                </button>
              ))
            ) : (
              <Empty label="履歴はまだありません" />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
function Empty({ label, success }: { label: string; success?: boolean }) {
  return (
    <div className={`empty ${success ? "success" : ""}`}>
      <span>{success ? "✓" : "—"}</span>
      {label}
    </div>
  );
}

function previewDocument(
  preview: PreviewHtml,
  scrollX: number,
  scrollY: number,
  zoom: number,
  fitOnReady: boolean,
): string {
  const pageNumberContent =
    preview.pageNumberFormat === "current"
      ? "counter(page)"
      : 'counter(page) "/" counter(pages)';
  const pageNumberRule = preview.pageNumber
    ? `@bottom-center { content: ${pageNumberContent}; color: #666; font-family: ${JSON.stringify(preview.pageNumberFont || "sans-serif")}; font-size: 8pt; }`
    : "";
  const support = `<style id="inkframe-preview-style">
@page { size: ${preview.paper} ${preview.orientation}; margin: ${preview.margin}; ${pageNumberRule} }
html { visibility: hidden; background: #e8e8e8; } body { margin: 0; background: #e8e8e8; }
.pagebreak { break-before: page !important; break-after: auto !important; page-break-before: always !important; page-break-after: auto !important; }
pre, pre.shiki {
  max-height: none !important;
  overflow: visible !important;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  break-inside: auto !important;
  page-break-inside: auto !important;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  orphans: 1;
  widows: 1;
}
pre code, pre.shiki code { white-space: inherit; overflow-wrap: inherit; }
.pagedjs_pages { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 28px; min-width: 100%; padding: 34px 24px 80px; width: max-content; }
.pagedjs_page { flex: none; margin: 0 !important; background: white; box-shadow: 0 2px 12px rgba(0,0,0,.18); }
</style><script>
(() => {
  let zoom = ${JSON.stringify(zoom)};
  let scrollFrame = 0;
  const clamp = value => Math.max(40, Math.min(200, Math.round(value)));
  const fitWidth = () => {
    const page = document.querySelector('.pagedjs_page');
    if (page?.offsetWidth) applyZoom(Math.max(0, innerWidth - 48) / page.offsetWidth * 100);
  };
  const applyZoom = (value, clientX = innerWidth / 2, clientY = innerHeight / 2) => {
    const pages = document.querySelector('.pagedjs_pages');
    zoom = clamp(value);
    if (!pages) return;
    const before = pages.getBoundingClientRect();
    const relativeX = before.width ? (clientX - before.left) / before.width : .5;
    const relativeY = before.height ? (clientY - before.top) / before.height : .5;
    pages.style.zoom = String(zoom / 100);
    requestAnimationFrame(() => {
      const after = pages.getBoundingClientRect();
      scrollBy(after.left + relativeX * after.width - clientX, after.top + relativeY * after.height - clientY);
      parent.postMessage({ type: 'inkframe:zoom', zoom }, '*');
    });
  };
  addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    applyZoom(zoom * Math.exp(-event.deltaY * .01), event.clientX, event.clientY);
  }, { passive: false });
  addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => parent.postMessage({ type: 'inkframe:scroll', scrollX, scrollY }, '*'));
  }, { passive: true });
  addEventListener('message', event => {
    if (event.data?.type === 'inkframe:set-zoom') applyZoom(event.data.zoom);
    if (event.data?.type === 'inkframe:fit-width') fitWidth();
  });
  window.PagedConfig = {
    before: async () => {
      if (!document.querySelector('.mermaid') || !window.mermaid) return;
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
      await window.mermaid.run();
    },
    after: flow => {
      if (${JSON.stringify(fitOnReady)}) fitWidth(); else applyZoom(zoom);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        scrollTo(${JSON.stringify(scrollX)}, ${JSON.stringify(scrollY)});
        requestAnimationFrame(() => {
          document.documentElement.style.visibility = 'visible';
          parent.postMessage({ type: 'inkframe:scroll', scrollX, scrollY }, '*');
          parent.postMessage({ type: 'inkframe:paged', pageCount: flow.total }, '*');
        });
      }));
    }
  };
  addEventListener('error', event => parent.postMessage({ type: 'inkframe:preview-error', message: event.message }, '*'));
  addEventListener('unhandledrejection', event => parent.postMessage({ type: 'inkframe:preview-error', message: String(event.reason) }, '*'));
})();
</script><script src="${preview.mermaidScriptUrl.replaceAll('"', "&quot;")}"></script><script src="${PAGED_POLYFILL_URL}"></script>`;
  return preview.html.replace("</head>", `${support}</head>`);
}

function PdfPreviewPane({
  preview,
  status,
  error,
  active,
  fitOnFirstRender,
  zoom,
  onZoom,
  initialScroll,
  onScroll,
}: {
  preview?: PreviewHtml;
  status: string;
  error?: string;
  active: boolean;
  fitOnFirstRender: boolean;
  zoom: number;
  onZoom: (zoom: number) => void;
  initialScroll: { x: number; y: number };
  onScroll: (position: { x: number; y: number }) => void;
}) {
  const [pageCount, setPageCount] = useState(0);
  const [frameDocuments, setFrameDocuments] = useState<[string, string]>([
    "",
    "",
  ]);
  const [activeFrame, setActiveFrame] = useState<0 | 1>(0);
  const [paginating, setPaginating] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const frameRefs = useRef<
    [HTMLIFrameElement | null, HTMLIFrameElement | null]
  >([null, null]);
  const activeFrameRef = useRef<0 | 1>(0);
  const pendingFrameRef = useRef<0 | 1>();
  const needsInitialFit = useRef(fitOnFirstRender);
  useEffect(
    () => () => {
      const frameWindow =
        frameRefs.current[activeFrameRef.current]?.contentWindow;
      if (frameWindow)
        onScroll({ x: frameWindow.scrollX, y: frameWindow.scrollY });
    },
    [onScroll],
  );
  useEffect(() => {
    if (!frameDocuments[0] && !frameDocuments[1])
      needsInitialFit.current = fitOnFirstRender;
  }, [fitOnFirstRender]);
  useEffect(() => {
    if (!preview) return;
    const currentFrame = activeFrameRef.current;
    const targetFrame: 0 | 1 = frameDocuments[currentFrame]
      ? currentFrame === 0
        ? 1
        : 0
      : currentFrame;
    const frameWindow = frameRefs.current[currentFrame]?.contentWindow;
    setPaginating(true);
    setPreviewError(undefined);
    pendingFrameRef.current = targetFrame;
    const nextDocument = previewDocument(
      preview,
      frameWindow?.scrollX ?? initialScroll.x,
      frameWindow?.scrollY ?? initialScroll.y,
      zoom,
      needsInitialFit.current,
    );
    setFrameDocuments((current) => {
      const next: [string, string] = [...current];
      next[targetFrame] = nextDocument;
      return next;
    });
  }, [preview]);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const frameIndex = frameRefs.current.findIndex(
        (frame) => event.source === frame?.contentWindow,
      );
      if (frameIndex < 0) return;
      if (event.data?.type === "inkframe:paged") {
        if (frameIndex !== pendingFrameRef.current) return;
        const nextFrame = frameIndex as 0 | 1;
        activeFrameRef.current = nextFrame;
        setActiveFrame(nextFrame);
        needsInitialFit.current = false;
        setPageCount(Number(event.data.pageCount) || 0);
        setPaginating(false);
      }
      if (event.data?.type === "inkframe:zoom" && active)
        onZoom(Number(event.data.zoom) || 100);
      if (event.data?.type === "inkframe:scroll")
        onScroll({
          x: Number(event.data.scrollX) || 0,
          y: Number(event.data.scrollY) || 0,
        });
      if (event.data?.type === "inkframe:preview-error") {
        setPreviewError(String(event.data.message));
        setPaginating(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [active, onScroll, onZoom]);
  useEffect(() => {
    const handleCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (!active) return;
      if (command === "zoom-in") changeZoom(zoom + 10);
      if (command === "zoom-out") changeZoom(zoom - 10);
      if (command === "zoom-actual") changeZoom(100);
      if (command === "zoom-fit") fitWidth();
    };
    window.addEventListener("inkframe:preview-command", handleCommand);
    return () =>
      window.removeEventListener("inkframe:preview-command", handleCommand);
  }, [active, zoom]);
  useEffect(() => {
    if (!active) return;
    changeZoom(zoom);
  }, [active]);
  const changeZoom = (next: number) =>
    frameRefs.current[activeFrameRef.current]?.contentWindow?.postMessage(
      { type: "inkframe:set-zoom", zoom: next },
      "*",
    );
  const fitWidth = () =>
    frameRefs.current[activeFrameRef.current]?.contentWindow?.postMessage(
      { type: "inkframe:fit-width" },
      "*",
    );
  return (
    <main
      className={`preview-pane ${active ? "active-document" : "inactive-document"}`}
      aria-hidden={!active}
    >
      <div className="preview-toolbar">
        <span>ページプレビュー</span>
        <span>{pageCount ? `${pageCount}ページ · ${status}` : status}</span>
      </div>
      <div className="html-preview-stage">
        {(status === "レンダリング中" || paginating) && (
          <div className="rendering-banner">
            <i /> レイアウトを組み立てています
          </div>
        )}
        {(error || previewError) && !frameDocuments[activeFrame] ? (
          <div className="preview-error">
            <strong>プレビューを更新できませんでした</strong>
            <span>{error || previewError}</span>
          </div>
        ) : (
          frameDocuments.map((srcDoc, index) =>
            srcDoc ? (
              <iframe
                ref={(frame) => {
                  frameRefs.current[index as 0 | 1] = frame;
                }}
                className={`html-preview ${index === activeFrame ? "active" : "inactive"}`}
                srcDoc={srcDoc}
                title="ページプレビュー"
                key={index}
              />
            ) : null,
          )
        )}
      </div>
      <div className="zoom-controls">
        <button onClick={() => changeZoom(zoom - 10)}>−</button>
        <span>{zoom}%</span>
        <button onClick={() => changeZoom(zoom + 10)}>＋</button>
        <button onClick={fitWidth}>幅に合わせる</button>
      </div>
    </main>
  );
}

function FontPicker({
  label,
  value,
  face,
  fonts,
  sample,
  onChange,
  onFaceChange,
}: {
  label: string;
  value?: string;
  face?: string;
  fonts: FontFamily[];
  sample: string;
  onChange: (value: string) => void;
  onFaceChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matchingFonts = fonts
    .filter((font) => font.family.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 60);
  const selectedFont = fonts.find((font) => font.family === value);
  const filtered =
    selectedFont &&
    !matchingFonts.some((font) => font.family === selectedFont.family)
      ? [selectedFont, ...matchingFonts]
      : matchingFonts;
  const faces = fonts.find((font) => font.family === value)?.faces ?? [];
  return (
    <div className="font-picker">
      <label>
        {label}
        <input
          placeholder="フォントを検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">システム既定</option>
        {filtered.map((font) => (
          <option value={font.family} key={font.family}>
            {font.family}
          </option>
        ))}
      </select>
      <label>
        ウェイト／スタイル
        <select
          value={face || ""}
          disabled={!value || faces.length === 0}
          onChange={(event) => onFaceChange(event.target.value)}
        >
          <option value="">フォント既定</option>
          {faces.map((item) => (
            <option value={item.name} key={item.name}>
              {item.style}
            </option>
          ))}
        </select>
      </label>
      <div
        className="font-sample"
        style={{ fontFamily: face || value || "inherit" }}
      >
        {sample}
      </div>
    </div>
  );
}

function RightInspector({
  tab,
  onTab,
  options,
  onOptions,
  themes,
  fonts,
  settings,
  result,
  onExport,
  onOpenResult,
  onRevealResult,
  onCreateTheme,
  onImportTheme,
  onEditTheme,
  onExportTheme,
  onDeleteTheme,
  onDefaultTheme,
}: {
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  options: ConvertOptions;
  onOptions: (options: ConvertOptions) => void;
  themes: Theme[];
  fonts: FontFamily[];
  settings: AppSettings;
  result?: ExportResult;
  onExport: () => void;
  onOpenResult: () => void;
  onRevealResult: () => void;
  onCreateTheme: () => void;
  onImportTheme: () => void;
  onEditTheme: (theme: Theme) => void;
  onExportTheme: (theme: Theme) => void;
  onDeleteTheme: (theme: Theme) => void;
  onDefaultTheme: (theme: Theme) => void;
}) {
  const update = (next: Partial<ConvertOptions>) =>
    onOptions({ ...options, ...next });
  const headingLevels = [1, 2, 3, 4, 5, 6] as const;
  return (
    <aside className="inspector">
      <nav className="inspector-tabs">
        {(["Style", "Layout", "Font", "Export"] as InspectorTab[]).map(
          (item) => (
            <button
              className={tab === item ? "selected" : ""}
              onClick={() => onTab(item)}
              key={item}
            >
              {item}
            </button>
          ),
        )}
      </nav>
      <div className="inspector-content">
        {tab === "Style" && (
          <>
            <SettingCard
              title="ドキュメントテーマ"
              description="PDFの組版と表現を選択"
            >
              <div className="theme-toolbar">
                <Button onClick={onCreateTheme}>テーマを追加</Button>
                <Button onClick={onImportTheme}>読み込む</Button>
              </div>
              <div className="theme-grid">
                {themes.map((theme, index) => (
                  <ThemeCard
                    theme={theme}
                    index={index}
                    selected={options.theme === theme.id}
                    isDefault={settings.defaultTheme === theme.id}
                    onSelect={() =>
                      update({
                        theme: theme.id,
                        ...(theme.paper ? { paper: theme.paper } : {}),
                        ...(theme.orientation
                          ? { orientation: theme.orientation }
                          : {}),
                      })
                    }
                    onDefault={() => onDefaultTheme(theme)}
                    onEdit={() => onEditTheme(theme)}
                    onExport={() => onExportTheme(theme)}
                    onDelete={() => onDeleteTheme(theme)}
                    key={theme.id}
                  />
                ))}
              </div>
            </SettingCard>
            <SettingCard title="コードテーマ">
              <select
                value={options.codeTheme ?? DEFAULT_CODE_THEME}
                onChange={(event) => update({ codeTheme: event.target.value })}
              >
                {CODE_THEMES.map((theme) => (
                  <option value={theme.id} key={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </SettingCard>
            <SettingCard title="表紙">
              <label className="switch-row">
                <span>
                  <strong>表紙を追加</strong>
                  <small>タイトル情報から生成します</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(options.cover)}
                  onChange={(event) => update({ cover: event.target.checked })}
                />
              </label>
            </SettingCard>
          </>
        )}
        {tab === "Layout" && (
          <>
            <SettingCard title="用紙サイズ">
              <Segmented
                value={options.paper || "A4"}
                values={["A4", "A5", "Letter"]}
                onChange={(paper) => update({ paper })}
              />
            </SettingCard>
            <SettingCard title="向き">
              <Segmented
                value={options.orientation || "portrait"}
                values={["portrait", "landscape"]}
                onChange={(orientation) =>
                  update({
                    orientation: orientation as "portrait" | "landscape",
                  })
                }
              />
            </SettingCard>
            <SettingCard title="余白">
              <Segmented
                value={options.margin || "18mm"}
                values={["12mm", "18mm", "25mm"]}
                onChange={(margin) => update({ margin })}
              />
            </SettingCard>
            <SettingCard title="ページ要素">
              <Toggle
                label="目次"
                checked={Boolean(options.toc)}
                onChange={(toc) => update({ toc })}
              />
              <Toggle
                label="ページ番号"
                checked={Boolean(options.pageNumber)}
                onChange={(pageNumber) => update({ pageNumber })}
              />
              {options.pageNumber && (
                <div className="page-number-options">
                  <label>
                    形式
                    <select
                      value={options.pageNumberFormat || "current-total"}
                      onChange={(event) =>
                        update({
                          pageNumberFormat: event.target.value as
                            | "current"
                            | "current-total",
                        })
                      }
                    >
                      <option value="current">n</option>
                      <option value="current-total">n/n</option>
                    </select>
                  </label>
                  <FontPicker
                    label="ページ番号のフォント"
                    value={options.pageNumberFont?.family}
                    face={options.pageNumberFont?.face}
                    fonts={fonts}
                    sample="1/12"
                    onChange={(family) =>
                      update({ pageNumberFont: { family } })
                    }
                    onFaceChange={(face) =>
                      update({
                        pageNumberFont: {
                          ...options.pageNumberFont,
                          face,
                        },
                      })
                    }
                  />
                </div>
              )}
            </SettingCard>
          </>
        )}
        {tab === "Font" && (
          <>
            <SettingCard
              title="ローカルフォント"
              description="端末にインストール済みのフォントを使用"
            >
              <FontPicker
                label="本文"
                value={options.font?.body}
                face={options.fontFace?.body}
                fonts={fonts}
                sample="あいうえお ABC 123"
                onChange={(body) =>
                  update({
                    font: { ...options.font, body },
                    fontFace: { ...options.fontFace, body: undefined },
                  })
                }
                onFaceChange={(body) =>
                  update({ fontFace: { ...options.fontFace, body } })
                }
              />
              <FontPicker
                label="見出し"
                value={options.font?.heading}
                face={options.fontFace?.heading}
                fonts={fonts}
                sample="見出しサンプル Heading"
                onChange={(heading) =>
                  update({
                    font: { ...options.font, heading },
                    fontFace: { ...options.fontFace, heading: undefined },
                  })
                }
                onFaceChange={(heading) =>
                  update({ fontFace: { ...options.fontFace, heading } })
                }
              />
              <FontPicker
                label="コード"
                value={options.font?.code}
                face={options.fontFace?.code}
                fonts={fonts}
                sample="const value = 1;"
                onChange={(code) =>
                  update({
                    font: { ...options.font, code },
                    fontFace: { ...options.fontFace, code: undefined },
                  })
                }
                onFaceChange={(code) =>
                  update({ fontFace: { ...options.fontFace, code } })
                }
              />
            </SettingCard>
            <SettingCard
              title="フォントサイズ"
              description="PDFに使用するサイズ"
            >
              <label>
                本文
                <span className="unit-input">
                  <input
                    type="number"
                    min="6"
                    max="72"
                    step="0.5"
                    value={options.fontSize?.body ?? 10.5}
                    onChange={(event) =>
                      update({
                        fontSize: {
                          ...options.fontSize,
                          body: Number(event.target.value),
                        },
                      })
                    }
                  />
                  <span>pt</span>
                </span>
              </label>
              {headingLevels.map((level) => {
                const key = `h${level}` as const;
                return (
                  <label key={key}>
                    {key.toUpperCase()}
                    <span className="unit-input">
                      <input
                        type="number"
                        min="6"
                        max="72"
                        step="0.5"
                        placeholder="テーマ既定"
                        value={options.fontSize?.[key] ?? ""}
                        onChange={(event) =>
                          update({
                            fontSize: {
                              ...options.fontSize,
                              [key]: event.target.value
                                ? Number(event.target.value)
                                : undefined,
                            },
                          })
                        }
                      />
                      <span>pt</span>
                    </span>
                  </label>
                );
              })}
              <Toggle
                label="フォントをPDFに埋め込む"
                checked
                onChange={() => undefined}
              />
            </SettingCard>
          </>
        )}
        {tab === "Export" && (
          <>
            <SettingCard title="出力設定">
              <label>
                ファイル名
                <input value={result?.fileName || "document.pdf"} readOnly />
              </label>
              <label>
                出力先
                <input
                  value={result?.outputPath || "書き出し時に選択"}
                  readOnly
                />
              </label>
              <Toggle
                label="PDFを圧縮"
                checked={false}
                onChange={() => undefined}
              />
              <Toggle
                label="メタデータを含める"
                checked
                onChange={() => undefined}
              />
              <label>
                パスワード保護
                <input type="password" placeholder="任意" />
              </label>
              <Button primary className="wide" onClick={onExport}>
                PDFを書き出す
              </Button>
            </SettingCard>
            {result && (
              <section className="export-result">
                <span className="result-icon">✓</span>
                <div>
                  <strong>書き出しが完了しました</strong>
                  <span>{result.fileName}</span>
                </div>
                <dl>
                  <div>
                    <dt>ページ</dt>
                    <dd>{result.pageCount || "—"}</dd>
                  </div>
                  <div>
                    <dt>サイズ</dt>
                    <dd>{formatBytes(result.fileSize)}</dd>
                  </div>
                </dl>
                <code>{result.outputPath}</code>
                <div className="result-actions">
                  <Button onClick={onOpenResult}>PDFを開く</Button>
                  <Button onClick={onRevealResult}>Finderに表示</Button>
                  <Button onClick={() => window.mdpdf.copy(result.outputPath)}>
                    パスをコピー
                  </Button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="switch-row compact">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SettingsDialog({
  initialOptions,
  themes,
  fonts,
  onCancel,
  onSave,
}: {
  initialOptions: ConvertOptions;
  themes: Theme[];
  fonts: FontFamily[];
  onCancel: () => void;
  onSave: (options: ConvertOptions) => void;
}) {
  const [draft, setDraft] = useState<ConvertOptions>(initialOptions);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);
  const update = (next: Partial<ConvertOptions>) =>
    setDraft((current) => ({ ...current, ...next }));
  return (
    <div
      className="settings-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <div>
            <h1 id="settings-title">規定の書式設定</h1>
            <p>新しい文書で使用する組版の初期値を設定します。</p>
          </div>
          <button
            className="settings-close"
            onClick={onCancel}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>
        <div className="settings-body">
          <SettingCard title="フォント">
            <div className="settings-font-grid">
              <FontPicker
                label="本文"
                value={draft.font?.body}
                face={draft.fontFace?.body}
                fonts={fonts}
                sample="あいうえお ABC 123"
                onChange={(body) =>
                  update({
                    font: { ...draft.font, body },
                    fontFace: { ...draft.fontFace, body: undefined },
                  })
                }
                onFaceChange={(body) =>
                  update({ fontFace: { ...draft.fontFace, body } })
                }
              />
              <FontPicker
                label="見出し"
                value={draft.font?.heading}
                face={draft.fontFace?.heading}
                fonts={fonts}
                sample="見出しサンプル Heading"
                onChange={(heading) =>
                  update({
                    font: { ...draft.font, heading },
                    fontFace: { ...draft.fontFace, heading: undefined },
                  })
                }
                onFaceChange={(heading) =>
                  update({ fontFace: { ...draft.fontFace, heading } })
                }
              />
              <FontPicker
                label="コード"
                value={draft.font?.code}
                face={draft.fontFace?.code}
                fonts={fonts}
                sample="const value = 1;"
                onChange={(code) =>
                  update({
                    font: { ...draft.font, code },
                    fontFace: { ...draft.fontFace, code: undefined },
                  })
                }
                onFaceChange={(code) =>
                  update({ fontFace: { ...draft.fontFace, code } })
                }
              />
            </div>
          </SettingCard>
          <SettingCard title="フォントサイズ">
            <div className="settings-size-grid">
              {(["body", "h1", "h2", "h3", "h4", "h5", "h6"] as const).map(
                (key) => (
                  <label key={key}>
                    {key === "body" ? "本文" : key.toUpperCase()}
                    <span className="unit-input">
                      <input
                        type="number"
                        min="6"
                        max="72"
                        step="0.5"
                        value={draft.fontSize?.[key] ?? ""}
                        placeholder={key === "body" ? "10.5" : "テーマ既定"}
                        onChange={(event) =>
                          update({
                            fontSize: {
                              ...draft.fontSize,
                              [key]: event.target.value
                                ? Number(event.target.value)
                                : undefined,
                            },
                          })
                        }
                      />
                      <span>pt</span>
                    </span>
                  </label>
                ),
              )}
            </div>
          </SettingCard>
          <div className="settings-two-column">
            <SettingCard title="用紙サイズ">
              <Segmented
                value={draft.paper || "A4"}
                values={["A4", "A5", "Letter"]}
                onChange={(paper) => update({ paper })}
              />
            </SettingCard>
            <SettingCard title="向き">
              <Segmented
                value={draft.orientation || "portrait"}
                values={["portrait", "landscape"]}
                onChange={(orientation) =>
                  update({
                    orientation: orientation as "portrait" | "landscape",
                  })
                }
              />
            </SettingCard>
            <SettingCard title="余白">
              <Segmented
                value={draft.margin || "18mm"}
                values={["12mm", "18mm", "25mm"]}
                onChange={(margin) => update({ margin })}
              />
            </SettingCard>
            <SettingCard title="ページ要素">
              <Toggle
                label="目次"
                checked={Boolean(draft.toc)}
                onChange={(toc) => update({ toc })}
              />
              <Toggle
                label="ページ番号"
                checked={Boolean(draft.pageNumber)}
                onChange={(pageNumber) => update({ pageNumber })}
              />
              {draft.pageNumber && (
                <div className="page-number-options">
                  <label>
                    形式
                    <select
                      value={draft.pageNumberFormat || "current-total"}
                      onChange={(event) =>
                        update({
                          pageNumberFormat: event.target.value as
                            | "current"
                            | "current-total",
                        })
                      }
                    >
                      <option value="current">n</option>
                      <option value="current-total">n/n</option>
                    </select>
                  </label>
                  <FontPicker
                    label="ページ番号のフォント"
                    value={draft.pageNumberFont?.family}
                    face={draft.pageNumberFont?.face}
                    fonts={fonts}
                    sample="1/12"
                    onChange={(family) =>
                      update({ pageNumberFont: { family } })
                    }
                    onFaceChange={(face) =>
                      update({
                        pageNumberFont: {
                          ...draft.pageNumberFont,
                          face,
                        },
                      })
                    }
                  />
                </div>
              )}
            </SettingCard>
            <SettingCard title="テーマ">
              <select
                value={draft.theme || "github"}
                onChange={(event) => update({ theme: event.target.value })}
              >
                {themes.map((theme) => (
                  <option value={theme.id} key={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </SettingCard>
            <SettingCard title="コードテーマ">
              <select
                value={draft.codeTheme || DEFAULT_CODE_THEME}
                onChange={(event) => update({ codeTheme: event.target.value })}
              >
                {CODE_THEMES.map((theme) => (
                  <option value={theme.id} key={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </SettingCard>
          </div>
          <SettingCard title="表紙">
            <Toggle
              label="タイトル情報から表紙を生成"
              checked={Boolean(draft.cover)}
              onChange={(cover) => update({ cover })}
            />
          </SettingCard>
        </div>
        <footer className="settings-footer">
          <Button onClick={() => setDraft(DEFAULT_OPTIONS)}>
            初期値に戻す
          </Button>
          <span />
          <Button onClick={onCancel}>キャンセル</Button>
          <Button primary onClick={() => onSave(draft)}>
            保存
          </Button>
        </footer>
      </section>
    </div>
  );
}

export function App() {
  const initialPreviewZoom = useRef(savedPreviewZoom());
  const [document, setDocument] = useState<DocumentFile>();
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [showingHome, setShowingHome] = useState(false);
  const [previews, setPreviews] = useState<Record<string, PreviewHtml>>({});
  const [previewAutoFit, setPreviewAutoFit] = useState<Record<string, boolean>>(
    {},
  );
  const [status, setStatus] = useState("待機中");
  const [watchStatus, setWatchStatus] = useState("未監視");
  const [error, setError] = useState<string>();
  const [inspection, setInspection] = useState(EMPTY_INSPECTION);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [fonts, setFonts] = useState<FontFamily[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [side, setSide] = useState<SideSection>("Source");
  const [tab, setTab] = useState<InspectorTab>("Style");
  const [result, setResult] = useState<ExportResult>();
  const [showingSettings, setShowingSettings] = useState(false);
  const [leftPaneOpen, setLeftPaneOpen] = useState(
    () => window.innerWidth >= 1180,
  );
  const [rightPaneOpen, setRightPaneOpen] = useState(
    () => window.innerWidth >= 1180,
  );
  const [previewZoom, setPreviewZoom] = useState(
    initialPreviewZoom.current ?? 100,
  );
  const renderId = useRef(0);
  const canAutoFitNextPreview = useRef(
    initialPreviewZoom.current === undefined,
  );
  const previewScroll = useRef(new Map<string, { x: number; y: number }>());
  const load = useCallback(async (next: DocumentFile) => {
    setDocuments((current) =>
      current.some((item) => item.path === next.path)
        ? current.map((item) => (item.path === next.path ? next : item))
        : [...current, next],
    );
    setDocument(next);
    setShowingHome(false);
    setWatchStatus(
      (await window.mdpdf.watch(next.path)) ? "監視中" : "監視エラー",
    );
    setHistory(await window.mdpdf.history());
  }, []);
  const open = useCallback(async () => {
    const next = await window.mdpdf.open();
    if (next) await load(next);
  }, [load]);
  const render = useCallback(async () => {
    if (!document) return;
    const id = ++renderId.current;
    setStatus("レンダリング中");
    setError(undefined);
    try {
      const [nextPreview, nextInspection] = await Promise.all([
        window.mdpdf.renderPreview(document.content, document.path, options),
        window.mdpdf.inspect(document.content),
      ]);
      if (id === renderId.current) {
        const autoFit = canAutoFitNextPreview.current;
        canAutoFitNextPreview.current = false;
        setPreviewAutoFit((current) => ({
          ...current,
          [document.path]: autoFit,
        }));
        setPreviews((current) => ({
          ...current,
          [document.path]: nextPreview,
        }));
        setInspection(nextInspection);
        setStatus("更新済み");
      }
    } catch (caught) {
      if (id === renderId.current) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus("エラー");
      }
    }
  }, [document, options]);
  useEffect(() => {
    Promise.all([
      window.mdpdf.themes(),
      window.mdpdf.history(),
      window.mdpdf.settings(),
    ]).then(([nextThemes, nextHistory, nextSettings]) => {
      setThemes(nextThemes);
      setHistory(nextHistory);
      setSettings(nextSettings);
      if (nextSettings.defaultOptions)
        setOptions({
          ...DEFAULT_OPTIONS,
          ...nextSettings.defaultOptions,
          font: {
            ...DEFAULT_OPTIONS.font,
            ...nextSettings.defaultOptions.font,
          },
          fontFace: {
            ...DEFAULT_OPTIONS.fontFace,
            ...nextSettings.defaultOptions.fontFace,
          },
          fontSize: {
            ...DEFAULT_OPTIONS.fontSize,
            ...nextSettings.defaultOptions.fontSize,
          },
          pageNumberFont: {
            ...DEFAULT_OPTIONS.pageNumberFont,
            ...nextSettings.defaultOptions.pageNumberFont,
          },
        });
      if (
        !nextSettings.defaultOptions?.theme &&
        nextSettings.defaultTheme &&
        nextThemes.some((theme) => theme.id === nextSettings.defaultTheme)
      )
        setOptions((current) => ({
          ...current,
          theme: nextSettings.defaultTheme,
        }));
    });
    window.mdpdf.fonts().then(setFonts).catch(console.error);
  }, []);
  useEffect(
    () => window.mdpdf.onOpenSettings(() => setShowingSettings(true)),
    [],
  );
  useEffect(() => {
    void window.mdpdf.updateMenuDocumentOptions({
      toc: options.toc,
      cover: options.cover,
      pageNumber: options.pageNumber,
    });
  }, [options.toc, options.cover, options.pageNumber]);
  useEffect(() => {
    const closePanesInNarrowWindow = () => {
      if (window.innerWidth >= 1180) return;
      setLeftPaneOpen(false);
      setRightPaneOpen(false);
    };
    window.addEventListener("resize", closePanesInNarrowWindow);
    closePanesInNarrowWindow();
    return () => window.removeEventListener("resize", closePanesInNarrowWindow);
  }, []);
  useEffect(
    () =>
      window.mdpdf.onMenuAction((action, value) => {
        if (action === "open") void open();
        if (action === "new-tab") setShowingHome(true);
        if (action === "open-recent" && typeof value === "string")
          void window.mdpdf.read(value).then(load);
        if (action === "export") void exportPdf();
        if (action === "open-editor" && document) void openLine(1);
        if (action === "reveal" && document)
          void window.mdpdf.reveal(document.path);
        if (action.startsWith("zoom-"))
          window.dispatchEvent(
            new CustomEvent("inkframe:preview-command", { detail: action }),
          );
        if (action === "toggle-option" && value && typeof value === "object") {
          const option = value as { key?: string; value?: boolean };
          if (["toc", "cover", "pageNumber"].includes(option.key ?? ""))
            setOptions((current) => ({
              ...current,
              [option.key!]: Boolean(option.value),
            }));
        }
        if (action === "document-settings") setShowingSettings(true);
        if (action === "next-tab" || action === "previous-tab") {
          const index = documents.findIndex(
            (item) => item.path === document?.path,
          );
          const direction = action === "next-tab" ? 1 : -1;
          const next = documents.at((index + direction) % documents.length);
          if (next) void selectTab(next.path);
        }
        if (action === "show-tabs") setShowingHome(true);
        if (action === "select-theme" && typeof value === "string")
          setOptions((current) => ({ ...current, theme: value }));
        if (action === "theme-create") void createTheme();
        if (action === "theme-import") void importTheme();
        if (action === "theme-manage") setShowingHome(true);
        const activeTheme = themes.find((theme) => theme.id === options.theme);
        if (action === "theme-edit" && activeTheme?.cssPath)
          void window.mdpdf.editTheme(activeTheme.cssPath);
        if (action === "theme-export" && activeTheme?.cssPath)
          void window.mdpdf.exportTheme(activeTheme.cssPath);
      }),
    [document, documents, load, open, options, themes],
  );
  useEffect(() => {
    const timer = window.setTimeout(render, 180);
    return () => window.clearTimeout(timer);
  }, [render]);
  useEffect(
    () =>
      window.mdpdf.onDocumentChanged(async (path) => {
        if (document?.path === path) {
          setStatus("変更を検出");
          await load(await window.mdpdf.read(path));
        }
      }),
    [document?.path, load],
  );
  useEffect(
    () => window.mdpdf.onWatchError(() => setWatchStatus("監視エラー")),
    [],
  );
  const exportPdf = async () => {
    if (!document) return;
    setStatus("PDFを書き出し中");
    setTab("Export");
    try {
      const next = await window.mdpdf.generatePdf(
        document.content,
        document.path,
        options,
      );
      if (next) {
        setResult(next);
        setStatus("書き出し完了");
      } else setStatus("キャンセル");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("エラー");
    }
  };
  const openLine = (line: number, column = 1) =>
    document && window.mdpdf.openEditor(document.path, line, column);
  const drop = async (file: File) => {
    if (/\.(md|markdown)$/i.test(file.name))
      await load(await window.mdpdf.read(window.mdpdf.filePath(file)));
  };
  const isTabDropArea = (event: React.DragEvent) => {
    const tabs = event.currentTarget.querySelector(".document-tabs");
    if (!tabs) return false;
    const bounds = tabs.getBoundingClientRect();
    const verticalTolerance = 28;
    return (
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top - verticalTolerance &&
      event.clientY <= bounds.bottom + verticalTolerance
    );
  };
  const dragOverTabs = (event: React.DragEvent) => {
    if (!isTabDropArea(event) || !event.dataTransfer.types.includes("Files"))
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const dropOnTabs = (event: React.DragEvent) => {
    if (!isTabDropArea(event)) return;
    const file = event.dataTransfer.files[0];
    if (!file || !/\.(md|markdown)$/i.test(file.name)) return;
    event.preventDefault();
    void drop(file);
  };
  const selectTab = async (path: string) => {
    const existing = documents.find((item) => item.path === path);
    if (existing) {
      setDocument(existing);
      setShowingHome(false);
      setInspection(EMPTY_INSPECTION);
      setError(undefined);
      setWatchStatus(
        (await window.mdpdf.watch(path)) ? "監視中" : "監視エラー",
      );
    }
  };
  const closeTab = async (path: string) => {
    const index = documents.findIndex((item) => item.path === path);
    const remaining = documents.filter((item) => item.path !== path);
    setDocuments(remaining);
    if (document?.path !== path) return;
    const next = remaining[Math.min(index, remaining.length - 1)];
    setDocument(next);
    setError(undefined);
    if (next)
      setWatchStatus(
        (await window.mdpdf.watch(next.path)) ? "監視中" : "監視エラー",
      );
    else {
      await window.mdpdf.watch();
      setWatchStatus("未監視");
    }
  };
  const createTheme = async () => {
    const sourceTheme = themes.some((theme) => theme.id === options.theme)
      ? options.theme
      : "github";
    const theme = await window.mdpdf.createTheme("マイテーマ", sourceTheme);
    setThemes(await window.mdpdf.themes());
    setOptions((current) => ({ ...current, theme: theme.id }));
    if (theme.cssPath) await window.mdpdf.editTheme(theme.cssPath);
  };
  const importTheme = async () => {
    const theme = await window.mdpdf.importTheme();
    if (!theme) return;
    setThemes(await window.mdpdf.themes());
    setOptions((current) => ({ ...current, theme: theme.id }));
  };
  const deleteTheme = async (theme: Theme) => {
    if (!theme.cssPath || !window.confirm(`「${theme.name}」を削除しますか？`))
      return;
    await window.mdpdf.deleteTheme(theme.cssPath);
    const nextThemes = await window.mdpdf.themes();
    setThemes(nextThemes);
    if (options.theme === theme.id)
      setOptions((current) => ({ ...current, theme: "github" }));
    if (settings.defaultTheme === theme.id)
      setSettings(await window.mdpdf.setDefaultTheme("github"));
  };
  const setDefaultTheme = async (theme: Theme) => {
    setSettings(await window.mdpdf.setDefaultTheme(theme.id));
  };
  const rememberPreviewScroll = useCallback(
    (path: string, position: { x: number; y: number }) => {
      previewScroll.current.set(path, position);
    },
    [],
  );
  const updatePreviewZoom = useCallback((zoom: number) => {
    setPreviewZoom(zoom);
    window.localStorage.setItem(PREVIEW_ZOOM_STORAGE_KEY, String(zoom));
  }, []);
  const home = (showAddButton = true) => (
    <Home
      history={history}
      themes={themes}
      settings={settings}
      showAddButton={showAddButton}
      onOpen={open}
      onOpenFolder={() =>
        window.mdpdf.openFolder().then((next) => next && load(next))
      }
      onRecent={(path) => window.mdpdf.read(path).then(load)}
      onDrop={drop}
      onCreateTheme={createTheme}
      onImportTheme={importTheme}
      onEditTheme={(theme) =>
        theme.cssPath && window.mdpdf.editTheme(theme.cssPath)
      }
      onExportTheme={(theme) =>
        theme.cssPath && window.mdpdf.exportTheme(theme.cssPath)
      }
      onDeleteTheme={deleteTheme}
      onDefaultTheme={setDefaultTheme}
    />
  );
  const settingsDialog = showingSettings ? (
    <SettingsDialog
      initialOptions={settings.defaultOptions ?? options}
      themes={themes}
      fonts={fonts}
      onCancel={() => setShowingSettings(false)}
      onSave={async (defaultOptions) => {
        setSettings(await window.mdpdf.setDefaultOptions(defaultOptions));
        setOptions(defaultOptions);
        setShowingSettings(false);
      }}
    />
  ) : null;
  if (!document)
    return (
      <>
        {home()}
        {settingsDialog}
      </>
    );
  const topBar = (
    <TopBar
      path={document.path}
      documents={documents}
      status={status}
      watchStatus={watchStatus}
      onAdd={() => setShowingHome(true)}
      onSelect={selectTab}
      onClose={closeTab}
      onOpenEditor={() => openLine(1)}
      onReveal={() => window.mdpdf.reveal(document.path)}
      onRefresh={render}
      onExport={exportPdf}
      leftPaneOpen={leftPaneOpen}
      rightPaneOpen={rightPaneOpen}
      onToggleLeftPane={() => setLeftPaneOpen((open) => !open)}
      onToggleRightPane={() => setRightPaneOpen((open) => !open)}
    />
  );
  if (showingHome)
    return (
      <div className="app-shell" onDragOver={dragOverTabs} onDrop={dropOnTabs}>
        {topBar}
        {home(false)}
        {settingsDialog}
      </div>
    );
  return (
    <div className="app-shell" onDragOver={dragOverTabs} onDrop={dropOnTabs}>
      {topBar}
      <div
        className={`workspace ${leftPaneOpen ? "left-pane-open" : ""} ${rightPaneOpen ? "right-pane-open" : ""}`}
      >
        {leftPaneOpen && (
          <LeftSidebar
            document={document}
            inspection={inspection}
            history={history}
            active={side}
            onActive={setSide}
            onOpenLine={openLine}
            onHistory={(path) => window.mdpdf.read(path).then(load)}
          />
        )}
        <div className="preview-stack">
          {documents.map((openDocument) => (
            <PdfPreviewPane
              key={openDocument.path}
              preview={previews[openDocument.path]}
              status={openDocument.path === document.path ? status : "待機中"}
              error={openDocument.path === document.path ? error : undefined}
              active={openDocument.path === document.path}
              fitOnFirstRender={Boolean(previewAutoFit[openDocument.path])}
              zoom={previewZoom}
              onZoom={updatePreviewZoom}
              initialScroll={
                previewScroll.current.get(openDocument.path) ?? { x: 0, y: 0 }
              }
              onScroll={(position) =>
                rememberPreviewScroll(openDocument.path, position)
              }
            />
          ))}
        </div>
        {rightPaneOpen && (
          <RightInspector
            tab={tab}
            onTab={setTab}
            options={options}
            onOptions={setOptions}
            themes={themes}
            fonts={fonts}
            settings={settings}
            result={result}
            onExport={exportPdf}
            onOpenResult={() =>
              result && window.mdpdf.openPath(result.outputPath)
            }
            onRevealResult={() =>
              result && window.mdpdf.reveal(result.outputPath)
            }
            onCreateTheme={createTheme}
            onImportTheme={importTheme}
            onEditTheme={(theme) =>
              theme.cssPath && window.mdpdf.editTheme(theme.cssPath)
            }
            onExportTheme={(theme) =>
              theme.cssPath && window.mdpdf.exportTheme(theme.cssPath)
            }
            onDeleteTheme={deleteTheme}
            onDefaultTheme={setDefaultTheme}
          />
        )}
      </div>
      {settingsDialog}
    </div>
  );
}
