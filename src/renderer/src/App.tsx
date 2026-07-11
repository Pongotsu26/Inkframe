import { useCallback, useEffect, useRef, useState } from "react";
import pagedPolyfillSource from "virtual:pagedjs-polyfill";
import type { AppSettings, ConvertOptions, DocumentFile, ExportResult, HistoryItem, Inspection, PreviewHtml, Theme } from "./types";

const PAGED_POLYFILL_URL = URL.createObjectURL(new Blob([pagedPolyfillSource], { type: "text/javascript" }));

const EMPTY_INSPECTION: Inspection = { outline: [], issues: [], assets: [] };
const DEFAULT_CODE_THEME = "github-dark";
const CODE_THEMES = [
  { id: "github-dark", name: "GitHub Dark" },
  { id: "light-plus", name: "Light Plus" },
  { id: "dark-plus", name: "Dark Plus" },
  { id: "github-light", name: "GitHub Light" },
  { id: "nord", name: "Nord" },
  { id: "one-dark-pro", name: "One Dark Pro" },
  { id: "dracula", name: "Dracula" }
];
const DEFAULT_OPTIONS: ConvertOptions = { theme: "github", codeTheme: DEFAULT_CODE_THEME, paper: "A4", margin: "18mm", orientation: "portrait", toc: false, pageNumber: true, cover: false, font: {}, fontSize: { body: 10.5 } };
const STARTER_TEMPLATES = ["University Report", "GitHub README", "Technical Document", "Meeting Notes", "Resume", "Blank"];
type InspectorTab = "Style" | "Layout" | "Font" | "Export";
type SideSection = "Source" | "Outline" | "Issues" | "Assets" | "History";

function Button({ children, primary, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button className={primary ? "button primary" : "button"} {...props}>{children}</button>;
}
function Segmented({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) {
  return <div className="segmented">{values.map(item => <button type="button" className={value === item ? "selected" : ""} onClick={() => onChange(item)} key={item}>{item}</button>)}</div>;
}
function SettingCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="setting-card"><div className="card-heading"><strong>{title}</strong>{description && <span>{description}</span>}</div>{children}</section>;
}

function Home({ history, themes, settings, showAddButton = true, onOpen, onOpenFolder, onRecent, onDrop, onCreateTheme, onImportTheme, onEditTheme, onExportTheme, onDeleteTheme, onDefaultTheme }: { history: HistoryItem[]; themes: Theme[]; settings: AppSettings; showAddButton?: boolean; onOpen: () => void; onOpenFolder: () => void; onRecent: (path: string) => void; onDrop: (file: File) => void; onCreateTheme: () => void; onImportTheme: () => void; onEditTheme: (theme: Theme) => void; onExportTheme: (theme: Theme) => void; onDeleteTheme: (theme: Theme) => void; onDefaultTheme: (theme: Theme) => void }) {
  const drop = (event: React.DragEvent) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onDrop(file); };
  return <main className="home">{showAddButton && <button className="home-add-document" onClick={onOpen} title="Markdownを追加" aria-label="Markdownを追加"><span>＋</span></button>}
    <div className="home-content"><div className="brand-mark">I</div><h1>Inkframe</h1><p>Markdownを、読みやすく美しいPDFへ仕上げるローカル組版スタジオ。</p>
      <div className="home-actions"><Button primary onClick={onOpen}>Markdownファイルを開く</Button><Button onClick={onOpenFolder}>フォルダを開く</Button></div>
      <button className="drop-zone" onDragOver={event => event.preventDefault()} onDrop={drop}>Markdownをここにドロップ<span>.md / .markdown</span></button>
      <section className="home-section"><h2>テンプレートから始める</h2><div className="template-grid">{STARTER_TEMPLATES.map((name, index) => <button className="template-card" key={name} onClick={onOpen}><span className={`template-preview preview-${index % 3}`} /><strong>{name}</strong><small>{index === 5 ? "自由な文書" : "整った初期スタイル"}</small></button>)}</div></section>
      <section className="home-section"><div className="home-section-heading"><h2>テーマ</h2><div className="theme-toolbar"><Button onClick={onCreateTheme}>テーマを追加</Button><Button onClick={onImportTheme}>読み込む</Button></div></div><div className="home-theme-grid">{themes.map((theme, index) => <ThemeCard theme={theme} index={index} selected={false} isDefault={settings.defaultTheme === theme.id} onSelect={() => undefined} onDefault={() => onDefaultTheme(theme)} onEdit={() => onEditTheme(theme)} onExport={() => onExportTheme(theme)} onDelete={() => onDeleteTheme(theme)} key={theme.id} />)}</div></section>
      {history.length > 0 && <section className="home-section"><h2>最近の文書</h2><div className="recent-list">{history.slice(0, 5).map(item => <button key={item.path} onClick={() => onRecent(item.path)}><strong>{item.path.split("/").pop()}</strong><span>{item.path}</span></button>)}</div></section>}
    </div>
  </main>;
}

function ThemeCard({ theme, index, selected, isDefault, onSelect, onDefault, onEdit, onExport, onDelete }: { theme: Theme; index: number; selected: boolean; isDefault: boolean; onSelect: () => void; onDefault: () => void; onEdit: () => void; onExport: () => void; onDelete: () => void }) {
  return <div className={`theme-card ${selected ? "selected" : ""}`}><button className={`default-theme-star ${isDefault ? "active" : ""}`} title={isDefault ? "既定のテーマ" : "既定のテーマに設定"} aria-label={isDefault ? `${theme.name}は既定のテーマです` : `${theme.name}を既定のテーマに設定`} onClick={onDefault}>★</button><button className="theme-select" onClick={onSelect}><span className={`theme-thumb thumb-${index % 3}`}><i /><i /><i /></span><strong>{theme.name}</strong><small>{theme.custom ? "カスタムCSS" : (theme.description || "組み込みテーマ")}</small></button>{theme.custom && <div className="theme-actions"><button onClick={onEdit}>編集</button><button onClick={onExport}>書出</button><button className="danger-action" onClick={onDelete}>削除</button></div>}</div>;
}

function TopBar({ path, documents, status, watchStatus, onAdd, onSelect, onClose, onOpenEditor, onReveal, onRefresh, onExport }: { path: string; documents: DocumentFile[]; status: string; watchStatus: string; onAdd: () => void; onSelect: (path: string) => void; onClose: (path: string) => void; onOpenEditor: () => void; onReveal: () => void; onRefresh: () => void; onExport: () => void }) {
  return <header className="topbar"><div className="topbar-left"><button className="add-document" onClick={onAdd} title="Markdownを追加" aria-label="Markdownを追加">＋</button><span className="app-name">Inkframe</span><div className="document-tabs" role="tablist">{documents.map(document => <div className={`document-tab ${document.path === path ? "active" : ""}`} role="tab" aria-selected={document.path === path} key={document.path}><button className="tab-select" onClick={() => onSelect(document.path)} title={document.path}>{document.path.split("/").pop()}</button><button className="tab-close" onClick={() => onClose(document.path)} title="タブを閉じる" aria-label={`${document.path.split("/").pop()}を閉じる`}>×</button></div>)}</div><span className={`status-dot ${watchStatus === "監視中" ? "online" : ""}`} /> <span className="status-text">{watchStatus}</span><span className="render-status">{status}</span></div>
    <div className="topbar-actions"><Button onClick={onOpenEditor}>VS Codeで開く</Button><Button onClick={onReveal}>Finderに表示</Button><Button onClick={onRefresh}>プレビュー更新</Button><Button primary onClick={onExport}>PDFを書き出す</Button></div></header>;
}

function LeftSidebar({ document, inspection, history, active, onActive, onOpenLine, onHistory }: { document: DocumentFile; inspection: Inspection; history: HistoryItem[]; active: SideSection; onActive: (value: SideSection) => void; onOpenLine: (line: number, column?: number) => void; onHistory: (path: string) => void }) {
  const sections: SideSection[] = ["Source", "Outline", "Issues", "Assets", "History"];
  return <aside className="left-sidebar"><nav className="side-tabs">{sections.map(section => <button className={active === section ? "selected" : ""} onClick={() => onActive(section)} key={section}><span>{section}</span>{section === "Issues" && inspection.issues.length > 0 && <b>{inspection.issues.length}</b>}</button>)}</nav>
    <div className="side-content">
      {active === "Source" && <><div className="section-label">OPEN EDITOR</div><button className="source-file selected"><span>MD</span><div><strong>{document.path.split("/").pop()}</strong><small>{document.path}</small></div></button><div className="source-meta"><span>{document.content.split(/\r?\n/).length} lines</span><span>{document.content.length.toLocaleString()} chars</span></div></>}
      {active === "Outline" && <><div className="section-label">DOCUMENT OUTLINE</div>{inspection.outline.length ? inspection.outline.map(item => <button className="tree-item" style={{ paddingLeft: 12 + (item.level - 1) * 14 }} onClick={() => onOpenLine(item.line)} key={`${item.line}-${item.text}`}><span className="hash">H{item.level}</span>{item.text}</button>) : <Empty label="見出しがありません" />}</>}
      {active === "Issues" && <><div className="section-label">DOCUMENT ISSUES</div>{inspection.issues.length ? inspection.issues.map((issue, index) => <button className="issue" onClick={() => onOpenLine(issue.line, issue.column)} key={`${issue.line}-${index}`}><span className={`severity ${issue.severity}`} /><div><strong>{issue.message}</strong><small>行 {issue.line}, 列 {issue.column} · VS Codeで開く</small></div></button>) : <Empty label="問題は見つかりませんでした" success />}</>}
      {active === "Assets" && <><div className="section-label">LINKED ASSETS</div>{inspection.assets.length ? inspection.assets.map(asset => <button className="asset" onClick={() => onOpenLine(asset.line)} key={`${asset.line}-${asset.path}`}><span>{asset.kind}</span><div><strong>{asset.path.split("/").pop()}</strong><small>{asset.path}</small></div></button>) : <Empty label="画像や添付ファイルはありません" />}</>}
      {active === "History" && <><div className="section-label">RECENT DOCUMENTS</div>{history.length ? history.map(item => <button className="history-item" onClick={() => onHistory(item.path)} key={item.path}><strong>{item.path.split("/").pop()}</strong><small>{new Date(item.openedAt).toLocaleString()}</small></button>) : <Empty label="履歴はまだありません" />}</>}
    </div></aside>;
}
function Empty({ label, success }: { label: string; success?: boolean }) { return <div className={`empty ${success ? "success" : ""}`}><span>{success ? "✓" : "—"}</span>{label}</div>; }

function previewDocument(preview: PreviewHtml, scrollX: number, scrollY: number, zoom: number, fitOnReady: boolean): string {
  const support = `<style id="inkframe-preview-style">
@page { size: ${preview.paper} ${preview.orientation}; margin: ${preview.margin}; }
html { visibility: hidden; background: #e8e8e8; } body { margin: 0; background: #e8e8e8; }
.pagebreak { break-before: page !important; break-after: auto !important; page-break-before: always !important; page-break-after: auto !important; }
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
</script><script src="${preview.mermaidScriptUrl.replaceAll('"', '&quot;')}"></script><script src="${PAGED_POLYFILL_URL}"></script>`;
  return preview.html.replace("</head>", `${support}</head>`);
}

function PdfPreviewPane({ preview, status, error, initialScroll, onScroll }: { preview?: PreviewHtml; status: string; error?: string; initialScroll: { x: number; y: number }; onScroll: (position: { x: number; y: number }) => void }) {
  const [zoom, setZoom] = useState(100);
  const [pageCount, setPageCount] = useState(0);
  const [srcDoc, setSrcDoc] = useState("");
  const [paginating, setPaginating] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const needsInitialFit = useRef(true);
  useEffect(() => {
    if (!preview) return;
    const frameWindow = frameRef.current?.contentWindow;
    setPaginating(true);
    setPreviewError(undefined);
    setSrcDoc(previewDocument(preview, frameWindow?.scrollX ?? initialScroll.x, frameWindow?.scrollY ?? initialScroll.y, zoom, needsInitialFit.current));
  }, [preview]);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "inkframe:paged") { needsInitialFit.current = false; setPageCount(Number(event.data.pageCount) || 0); setPaginating(false); }
      if (event.data?.type === "inkframe:zoom") setZoom(Number(event.data.zoom) || 100);
      if (event.data?.type === "inkframe:scroll") onScroll({ x: Number(event.data.scrollX) || 0, y: Number(event.data.scrollY) || 0 });
      if (event.data?.type === "inkframe:preview-error") { setPreviewError(String(event.data.message)); setPaginating(false); }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onScroll]);
  const changeZoom = (next: number) => frameRef.current?.contentWindow?.postMessage({ type: "inkframe:set-zoom", zoom: next }, "*");
  const fitWidth = () => frameRef.current?.contentWindow?.postMessage({ type: "inkframe:fit-width" }, "*");
  return <main className="preview-pane"><div className="preview-toolbar"><span>ページプレビュー</span><span>{pageCount ? `${pageCount}ページ · ${status}` : status}</span></div><div className="html-preview-stage">
    {(status === "レンダリング中" || paginating) && <div className="rendering-banner"><i /> レイアウトを組み立てています</div>}
    {error || previewError ? <div className="preview-error"><strong>プレビューを更新できませんでした</strong><span>{error || previewError}</span></div> : <iframe ref={frameRef} className="html-preview" srcDoc={srcDoc} title="ページプレビュー" />}
  </div><div className="zoom-controls"><button onClick={() => changeZoom(zoom - 10)}>−</button><span>{zoom}%</span><button onClick={() => changeZoom(zoom + 10)}>＋</button><button onClick={fitWidth}>幅に合わせる</button></div></main>;
}

function FontPicker({ label, value, fonts, sample, onChange }: { label: string; value?: string; fonts: string[]; sample: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = fonts.filter(font => font.toLowerCase().includes(query.toLowerCase())).slice(0, 60);
  return <div className="font-picker"><label>{label}<input placeholder="フォントを検索" value={query} onChange={event => setQuery(event.target.value)} /></label><select value={value || ""} onChange={event => onChange(event.target.value)}><option value="">システム既定</option>{filtered.map(font => <option key={font}>{font}</option>)}</select><div className="font-sample" style={{ fontFamily: value || "inherit" }}>{sample}</div></div>;
}

function RightInspector({ tab, onTab, options, onOptions, themes, fonts, settings, result, onExport, onOpenResult, onRevealResult, onCreateTheme, onImportTheme, onEditTheme, onExportTheme, onDeleteTheme, onDefaultTheme }: { tab: InspectorTab; onTab: (tab: InspectorTab) => void; options: ConvertOptions; onOptions: (options: ConvertOptions) => void; themes: Theme[]; fonts: string[]; settings: AppSettings; result?: ExportResult; onExport: () => void; onOpenResult: () => void; onRevealResult: () => void; onCreateTheme: () => void; onImportTheme: () => void; onEditTheme: (theme: Theme) => void; onExportTheme: (theme: Theme) => void; onDeleteTheme: (theme: Theme) => void; onDefaultTheme: (theme: Theme) => void }) {
  const update = (next: Partial<ConvertOptions>) => onOptions({ ...options, ...next });
  const headingLevels = ([1, 2, 3, 4, 5, 6] as const);
  return <aside className="inspector"><nav className="inspector-tabs">{(["Style", "Layout", "Font", "Export"] as InspectorTab[]).map(item => <button className={tab === item ? "selected" : ""} onClick={() => onTab(item)} key={item}>{item}</button>)}</nav><div className="inspector-content">
    {tab === "Style" && <><SettingCard title="ドキュメントテーマ" description="PDFの組版と表現を選択"><div className="theme-toolbar"><Button onClick={onCreateTheme}>テーマを追加</Button><Button onClick={onImportTheme}>読み込む</Button></div><div className="theme-grid">{themes.map((theme, index) => <ThemeCard theme={theme} index={index} selected={options.theme === theme.id} isDefault={settings.defaultTheme === theme.id} onSelect={() => update({ theme: theme.id, ...(theme.paper ? { paper: theme.paper } : {}), ...(theme.orientation ? { orientation: theme.orientation } : {}) })} onDefault={() => onDefaultTheme(theme)} onEdit={() => onEditTheme(theme)} onExport={() => onExportTheme(theme)} onDelete={() => onDeleteTheme(theme)} key={theme.id} />)}</div></SettingCard><SettingCard title="コードテーマ"><select value={options.codeTheme ?? DEFAULT_CODE_THEME} onChange={event => update({ codeTheme: event.target.value })}>{CODE_THEMES.map(theme => <option value={theme.id} key={theme.id}>{theme.name}</option>)}</select></SettingCard><SettingCard title="表紙"><label className="switch-row"><span><strong>表紙を追加</strong><small>タイトル情報から生成します</small></span><input type="checkbox" checked={Boolean(options.cover)} onChange={event => update({ cover: event.target.checked })} /></label></SettingCard></>}
    {tab === "Layout" && <><SettingCard title="用紙サイズ"><Segmented value={options.paper || "A4"} values={["A4", "A5", "Letter"]} onChange={paper => update({ paper })} /></SettingCard><SettingCard title="向き"><Segmented value={options.orientation || "portrait"} values={["portrait", "landscape"]} onChange={orientation => update({ orientation: orientation as "portrait" | "landscape" })} /></SettingCard><SettingCard title="余白"><Segmented value={options.margin || "18mm"} values={["12mm", "18mm", "25mm"]} onChange={margin => update({ margin })} /></SettingCard><SettingCard title="ページ要素"><Toggle label="目次" checked={Boolean(options.toc)} onChange={toc => update({ toc })} /><Toggle label="ページ番号" checked={Boolean(options.pageNumber)} onChange={pageNumber => update({ pageNumber })} /></SettingCard></>}
    {tab === "Font" && <><SettingCard title="ローカルフォント" description="端末にインストール済みのフォントを使用"><FontPicker label="本文" value={options.font?.body} fonts={fonts} sample="あいうえお ABC 123" onChange={body => update({ font: { ...options.font, body } })} /><FontPicker label="見出し" value={options.font?.heading} fonts={fonts} sample="見出しサンプル Heading" onChange={heading => update({ font: { ...options.font, heading } })} /><FontPicker label="コード" value={options.font?.code} fonts={fonts} sample="const value = 1;" onChange={code => update({ font: { ...options.font, code } })} /></SettingCard><SettingCard title="フォントサイズ" description="PDFに使用するサイズ"><label>本文<span className="unit-input"><input type="number" min="6" max="72" step="0.5" value={options.fontSize?.body ?? 10.5} onChange={event => update({ fontSize: { ...options.fontSize, body: Number(event.target.value) } })} /><span>pt</span></span></label>{headingLevels.map(level => { const key = `h${level}` as const; return <label key={key}>{key.toUpperCase()}<span className="unit-input"><input type="number" min="6" max="72" step="0.5" placeholder="テーマ既定" value={options.fontSize?.[key] ?? ""} onChange={event => update({ fontSize: { ...options.fontSize, [key]: event.target.value ? Number(event.target.value) : undefined } })} /><span>pt</span></span></label>; })}<Toggle label="フォントをPDFに埋め込む" checked onChange={() => undefined} /></SettingCard></>}
    {tab === "Export" && <><SettingCard title="出力設定"><label>ファイル名<input value={result?.fileName || "document.pdf"} readOnly /></label><label>出力先<input value={result?.outputPath || "書き出し時に選択"} readOnly /></label><Toggle label="PDFを圧縮" checked={false} onChange={() => undefined} /><Toggle label="メタデータを含める" checked onChange={() => undefined} /><label>パスワード保護<input type="password" placeholder="任意" /></label><Button primary className="wide" onClick={onExport}>PDFを書き出す</Button></SettingCard>{result && <section className="export-result"><span className="result-icon">✓</span><div><strong>書き出しが完了しました</strong><span>{result.fileName}</span></div><dl><div><dt>ページ</dt><dd>{result.pageCount || "—"}</dd></div><div><dt>サイズ</dt><dd>{formatBytes(result.fileSize)}</dd></div></dl><code>{result.outputPath}</code><div className="result-actions"><Button onClick={onOpenResult}>PDFを開く</Button><Button onClick={onRevealResult}>Finderに表示</Button><Button onClick={() => window.mdpdf.copy(result.outputPath)}>パスをコピー</Button></div></section>}</>}
  </div></aside>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="switch-row compact"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export function App() {
  const [document, setDocument] = useState<DocumentFile>(); const [documents, setDocuments] = useState<DocumentFile[]>([]); const [showingHome, setShowingHome] = useState(false); const [preview, setPreview] = useState<PreviewHtml>(); const [status, setStatus] = useState("待機中"); const [watchStatus, setWatchStatus] = useState("未監視"); const [error, setError] = useState<string>();
  const [inspection, setInspection] = useState(EMPTY_INSPECTION); const [history, setHistory] = useState<HistoryItem[]>([]); const [themes, setThemes] = useState<Theme[]>([]); const [fonts, setFonts] = useState<string[]>([]); const [settings, setSettings] = useState<AppSettings>({}); const [options, setOptions] = useState(DEFAULT_OPTIONS); const [side, setSide] = useState<SideSection>("Source"); const [tab, setTab] = useState<InspectorTab>("Style"); const [result, setResult] = useState<ExportResult>();
  const renderId = useRef(0);
  const previewScroll = useRef(new Map<string, { x: number; y: number }>());
  const load = useCallback(async (next: DocumentFile) => { setDocuments(current => current.some(item => item.path === next.path) ? current.map(item => item.path === next.path ? next : item) : [...current, next]); setDocument(next); setShowingHome(false); setWatchStatus(await window.mdpdf.watch(next.path) ? "監視中" : "監視エラー"); setHistory(await window.mdpdf.history()); }, []);
  const open = useCallback(async () => { const next = await window.mdpdf.open(); if (next) await load(next); }, [load]);
  const render = useCallback(async () => { if (!document) return; const id = ++renderId.current; setStatus("レンダリング中"); setError(undefined); try { const [nextPreview, nextInspection] = await Promise.all([window.mdpdf.renderPreview(document.content, document.path, options), window.mdpdf.inspect(document.content)]); if (id === renderId.current) { setPreview(nextPreview); setInspection(nextInspection); setStatus("更新済み"); } } catch (caught) { if (id === renderId.current) { setError(caught instanceof Error ? caught.message : String(caught)); setStatus("エラー"); } } }, [document, options]);
  useEffect(() => { Promise.all([window.mdpdf.themes(), window.mdpdf.fonts(), window.mdpdf.history(), window.mdpdf.settings()]).then(([nextThemes, nextFonts, nextHistory, nextSettings]) => { setThemes(nextThemes); setFonts(nextFonts); setHistory(nextHistory); setSettings(nextSettings); if (nextSettings.defaultTheme && nextThemes.some(theme => theme.id === nextSettings.defaultTheme)) setOptions(current => ({ ...current, theme: nextSettings.defaultTheme })); }); }, []);
  useEffect(() => { const timer = window.setTimeout(render, 180); return () => window.clearTimeout(timer); }, [render]);
  useEffect(() => window.mdpdf.onDocumentChanged(async path => { if (document?.path === path) { setStatus("変更を検出"); await load(await window.mdpdf.read(path)); } }), [document?.path, load]);
  useEffect(() => window.mdpdf.onWatchError(() => setWatchStatus("監視エラー")), []);
  const exportPdf = async () => { if (!document) return; setStatus("PDFを書き出し中"); setTab("Export"); try { const next = await window.mdpdf.generatePdf(document.content, document.path, options); if (next) { setResult(next); setStatus("書き出し完了"); } else setStatus("キャンセル"); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setStatus("エラー"); } };
  const openLine = (line: number, column = 1) => document && window.mdpdf.openEditor(document.path, line, column);
  const drop = async (file: File) => { if (/\.(md|markdown)$/i.test(file.name)) await load(await window.mdpdf.read(window.mdpdf.filePath(file))); };
  const selectTab = async (path: string) => { const existing = documents.find(item => item.path === path); if (existing) { setDocument(existing); setShowingHome(false); setPreview(undefined); setInspection(EMPTY_INSPECTION); setError(undefined); setWatchStatus(await window.mdpdf.watch(path) ? "監視中" : "監視エラー"); } };
  const closeTab = async (path: string) => { const index = documents.findIndex(item => item.path === path); const remaining = documents.filter(item => item.path !== path); setDocuments(remaining); if (document?.path !== path) return; const next = remaining[Math.min(index, remaining.length - 1)]; setDocument(next); setPreview(undefined); setError(undefined); if (next) setWatchStatus(await window.mdpdf.watch(next.path) ? "監視中" : "監視エラー"); else { await window.mdpdf.watch(); setWatchStatus("未監視"); } };
  const createTheme = async () => { const sourceTheme = themes.some(theme => theme.id === options.theme) ? options.theme : "github"; const theme = await window.mdpdf.createTheme("マイテーマ", sourceTheme); setThemes(await window.mdpdf.themes()); setOptions(current => ({ ...current, theme: theme.id })); if (theme.cssPath) await window.mdpdf.editTheme(theme.cssPath); };
  const importTheme = async () => { const theme = await window.mdpdf.importTheme(); if (!theme) return; setThemes(await window.mdpdf.themes()); setOptions(current => ({ ...current, theme: theme.id })); };
  const deleteTheme = async (theme: Theme) => { if (!theme.cssPath || !window.confirm(`「${theme.name}」を削除しますか？`)) return; await window.mdpdf.deleteTheme(theme.cssPath); const nextThemes = await window.mdpdf.themes(); setThemes(nextThemes); if (options.theme === theme.id) setOptions(current => ({ ...current, theme: "github" })); if (settings.defaultTheme === theme.id) setSettings(await window.mdpdf.setDefaultTheme("github")); };
  const setDefaultTheme = async (theme: Theme) => { setSettings(await window.mdpdf.setDefaultTheme(theme.id)); };
  const rememberPreviewScroll = useCallback((path: string, position: { x: number; y: number }) => { previewScroll.current.set(path, position); }, []);
  const home = (showAddButton = true) => <Home history={history} themes={themes} settings={settings} showAddButton={showAddButton} onOpen={open} onOpenFolder={() => window.mdpdf.openFolder().then(next => next && load(next))} onRecent={path => window.mdpdf.read(path).then(load)} onDrop={drop} onCreateTheme={createTheme} onImportTheme={importTheme} onEditTheme={theme => theme.cssPath && window.mdpdf.editTheme(theme.cssPath)} onExportTheme={theme => theme.cssPath && window.mdpdf.exportTheme(theme.cssPath)} onDeleteTheme={deleteTheme} onDefaultTheme={setDefaultTheme} />;
  if (!document) return home();
  const topBar = <TopBar path={document.path} documents={documents} status={status} watchStatus={watchStatus} onAdd={() => setShowingHome(true)} onSelect={selectTab} onClose={closeTab} onOpenEditor={() => openLine(1)} onReveal={() => window.mdpdf.reveal(document.path)} onRefresh={render} onExport={exportPdf} />;
  if (showingHome) return <div className="app-shell">{topBar}{home(false)}</div>;
  return <div className="app-shell">{topBar}<div className="workspace"><LeftSidebar document={document} inspection={inspection} history={history} active={side} onActive={setSide} onOpenLine={openLine} onHistory={path => window.mdpdf.read(path).then(load)} /><PdfPreviewPane key={document.path} preview={preview} status={status} error={error} initialScroll={previewScroll.current.get(document.path) ?? { x: 0, y: 0 }} onScroll={position => rememberPreviewScroll(document.path, position)} /><RightInspector tab={tab} onTab={setTab} options={options} onOptions={setOptions} themes={themes} fonts={fonts} settings={settings} result={result} onExport={exportPdf} onOpenResult={() => result && window.mdpdf.openPath(result.outputPath)} onRevealResult={() => result && window.mdpdf.reveal(result.outputPath)} onCreateTheme={createTheme} onImportTheme={importTheme} onEditTheme={theme => theme.cssPath && window.mdpdf.editTheme(theme.cssPath)} onExportTheme={theme => theme.cssPath && window.mdpdf.exportTheme(theme.cssPath)} onDeleteTheme={deleteTheme} onDefaultTheme={setDefaultTheme} /></div></div>;
}
