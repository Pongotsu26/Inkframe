import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConvertOptions, DocumentFile, ExportResult, HistoryItem, Inspection, Theme } from "./types";

const EMPTY_INSPECTION: Inspection = { outline: [], issues: [], assets: [] };
const DEFAULT_OPTIONS: ConvertOptions = { theme: "github", paper: "A4", margin: "18mm", orientation: "portrait", toc: false, pageNumber: true, cover: false, font: {} };
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

function Home({ history, onOpen, onOpenFolder, onRecent, onDrop }: { history: HistoryItem[]; onOpen: () => void; onOpenFolder: () => void; onRecent: (path: string) => void; onDrop: (file: File) => void }) {
  const drop = (event: React.DragEvent) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onDrop(file); };
  return <main className="home">
    <div className="home-content"><div className="brand-mark">M</div><h1>mdpdf</h1><p>Markdownを、読みやすく美しいPDFへ仕上げるローカルスタジオ。</p>
      <div className="home-actions"><Button primary onClick={onOpen}>Markdownファイルを開く</Button><Button onClick={onOpenFolder}>フォルダを開く</Button></div>
      <button className="drop-zone" onDragOver={event => event.preventDefault()} onDrop={drop}>Markdownをここにドロップ<span>.md / .markdown</span></button>
      <section className="home-section"><h2>テンプレートから始める</h2><div className="template-grid">{STARTER_TEMPLATES.map((name, index) => <button className="template-card" key={name} onClick={onOpen}><span className={`template-preview preview-${index % 3}`} /><strong>{name}</strong><small>{index === 5 ? "自由な文書" : "整った初期スタイル"}</small></button>)}</div></section>
      {history.length > 0 && <section className="home-section"><h2>最近の文書</h2><div className="recent-list">{history.slice(0, 5).map(item => <button key={item.path} onClick={() => onRecent(item.path)}><strong>{item.path.split("/").pop()}</strong><span>{item.path}</span></button>)}</div></section>}
    </div>
  </main>;
}

function TopBar({ path, status, watchStatus, onOpenEditor, onReveal, onRefresh, onExport }: { path: string; status: string; watchStatus: string; onOpenEditor: () => void; onReveal: () => void; onRefresh: () => void; onExport: () => void }) {
  return <header className="topbar"><div className="topbar-left"><span className="app-name">mdpdf</span><span className="file-name" title={path}>{path.split("/").pop()}</span><span className={`status-dot ${watchStatus === "監視中" ? "online" : ""}`} /> <span className="status-text">{watchStatus}</span><span className="render-status">{status}</span></div>
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

function PdfPreviewPane({ html, status, error }: { html: string; status: string; error?: string }) {
  const [zoom, setZoom] = useState(82);
  return <main className="preview-pane"><div className="preview-toolbar"><span>PDFプレビュー</span><span>{status}</span></div><div className="page-stage">
    {status === "レンダリング中" && <div className="rendering-banner"><i /> レイアウトを組み立てています</div>}
    {error ? <div className="preview-error"><strong>プレビューを更新できませんでした</strong><span>{error}</span></div> : <div className={`paper-wrap ${status === "レンダリング中" ? "loading" : ""}`} style={{ width: `${zoom}%` }}><iframe title="PDF preview" srcDoc={html} /></div>}
  </div><div className="zoom-controls"><button onClick={() => setZoom(Math.max(40, zoom - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom(Math.min(130, zoom + 10))}>＋</button><button onClick={() => setZoom(82)}>幅に合わせる</button></div></main>;
}

function FontPicker({ label, value, fonts, sample, onChange }: { label: string; value?: string; fonts: string[]; sample: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = fonts.filter(font => font.toLowerCase().includes(query.toLowerCase())).slice(0, 60);
  return <div className="font-picker"><label>{label}<input placeholder="フォントを検索" value={query} onChange={event => setQuery(event.target.value)} /></label><select value={value || ""} onChange={event => onChange(event.target.value)}><option value="">システム既定</option>{filtered.map(font => <option key={font}>{font}</option>)}</select><div className="font-sample" style={{ fontFamily: value || "inherit" }}>{sample}</div></div>;
}

function RightInspector({ tab, onTab, options, onOptions, themes, fonts, result, onExport, onOpenResult, onRevealResult }: { tab: InspectorTab; onTab: (tab: InspectorTab) => void; options: ConvertOptions; onOptions: (options: ConvertOptions) => void; themes: Theme[]; fonts: string[]; result?: ExportResult; onExport: () => void; onOpenResult: () => void; onRevealResult: () => void }) {
  const update = (next: Partial<ConvertOptions>) => onOptions({ ...options, ...next });
  return <aside className="inspector"><nav className="inspector-tabs">{(["Style", "Layout", "Font", "Export"] as InspectorTab[]).map(item => <button className={tab === item ? "selected" : ""} onClick={() => onTab(item)} key={item}>{item}</button>)}</nav><div className="inspector-content">
    {tab === "Style" && <><SettingCard title="ドキュメントテーマ" description="PDFの組版と表現を選択"><div className="theme-grid">{themes.map((theme, index) => <button className={`theme-card ${options.theme === theme.id ? "selected" : ""}`} onClick={() => update({ theme: theme.id })} key={theme.id}><span className={`theme-thumb thumb-${index % 3}`}><i /><i /><i /></span><strong>{theme.name}</strong><small>{theme.id === "github" ? "README向け" : "印刷に最適化"}</small></button>)}</div></SettingCard><SettingCard title="コードテーマ"><select><option>GitHub Dark</option><option>Dark Plus</option><option>Nord</option></select></SettingCard><SettingCard title="表紙"><label className="switch-row"><span><strong>表紙を追加</strong><small>タイトル情報から生成します</small></span><input type="checkbox" checked={Boolean(options.cover)} onChange={event => update({ cover: event.target.checked })} /></label></SettingCard></>}
    {tab === "Layout" && <><SettingCard title="用紙サイズ"><Segmented value={options.paper || "A4"} values={["A4", "A5", "Letter"]} onChange={paper => update({ paper })} /></SettingCard><SettingCard title="向き"><Segmented value={options.orientation || "portrait"} values={["portrait", "landscape"]} onChange={orientation => update({ orientation: orientation as "portrait" | "landscape" })} /></SettingCard><SettingCard title="余白"><Segmented value={options.margin || "18mm"} values={["12mm", "18mm", "25mm"]} onChange={margin => update({ margin })} /></SettingCard><SettingCard title="ページ要素"><Toggle label="目次" checked={Boolean(options.toc)} onChange={toc => update({ toc })} /><Toggle label="ページ番号" checked={Boolean(options.pageNumber)} onChange={pageNumber => update({ pageNumber })} /><Toggle label="ヘッダー" checked={false} onChange={() => undefined} /><Toggle label="フッター" checked={false} onChange={() => undefined} /></SettingCard></>}
    {tab === "Font" && <><SettingCard title="ローカルフォント" description="端末にインストール済みのフォントを使用"><FontPicker label="本文" value={options.font?.body} fonts={fonts} sample="あいうえお ABC 123" onChange={body => update({ font: { ...options.font, body } })} /><FontPicker label="見出し" value={options.font?.heading} fonts={fonts} sample="見出しサンプル Heading" onChange={heading => update({ font: { ...options.font, heading } })} /><FontPicker label="コード" value={options.font?.code} fonts={fonts} sample="const value = 1;" onChange={code => update({ font: { ...options.font, code } })} /></SettingCard><SettingCard title="組版"><label>文字サイズ<input type="range" min="9" max="18" defaultValue="11" /></label><label>行の高さ<input type="range" min="13" max="24" defaultValue="17" /></label><Toggle label="フォントをPDFに埋め込む" checked onChange={() => undefined} /></SettingCard></>}
    {tab === "Export" && <><SettingCard title="出力設定"><label>ファイル名<input value={result?.fileName || "document.pdf"} readOnly /></label><label>出力先<input value={result?.outputPath || "書き出し時に選択"} readOnly /></label><Toggle label="PDFを圧縮" checked={false} onChange={() => undefined} /><Toggle label="メタデータを含める" checked onChange={() => undefined} /><label>パスワード保護<input type="password" placeholder="任意" /></label><Button primary className="wide" onClick={onExport}>PDFを書き出す</Button></SettingCard>{result && <section className="export-result"><span className="result-icon">✓</span><div><strong>書き出しが完了しました</strong><span>{result.fileName}</span></div><dl><div><dt>ページ</dt><dd>{result.pageCount || "—"}</dd></div><div><dt>サイズ</dt><dd>{formatBytes(result.fileSize)}</dd></div></dl><code>{result.outputPath}</code><div className="result-actions"><Button onClick={onOpenResult}>PDFを開く</Button><Button onClick={onRevealResult}>Finderに表示</Button><Button onClick={() => window.mdpdf.copy(result.outputPath)}>パスをコピー</Button></div></section>}</>}
  </div></aside>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="switch-row compact"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export function App() {
  const [document, setDocument] = useState<DocumentFile>(); const [html, setHtml] = useState(""); const [status, setStatus] = useState("待機中"); const [watchStatus, setWatchStatus] = useState("未監視"); const [error, setError] = useState<string>();
  const [inspection, setInspection] = useState(EMPTY_INSPECTION); const [history, setHistory] = useState<HistoryItem[]>([]); const [themes, setThemes] = useState<Theme[]>([]); const [fonts, setFonts] = useState<string[]>([]); const [options, setOptions] = useState(DEFAULT_OPTIONS); const [side, setSide] = useState<SideSection>("Source"); const [tab, setTab] = useState<InspectorTab>("Style"); const [result, setResult] = useState<ExportResult>();
  const renderId = useRef(0);
  const load = useCallback(async (next: DocumentFile) => { setDocument(next); setWatchStatus(await window.mdpdf.watch(next.path) ? "監視中" : "監視エラー"); setHistory(await window.mdpdf.history()); }, []);
  const open = useCallback(async () => { const next = await window.mdpdf.open(); if (next) await load(next); }, [load]);
  const render = useCallback(async () => { if (!document) return; const id = ++renderId.current; setStatus("レンダリング中"); setError(undefined); try { const [nextHtml, nextInspection] = await Promise.all([window.mdpdf.renderPreview(document.content, document.path, options), window.mdpdf.inspect(document.content)]); if (id === renderId.current) { setHtml(nextHtml); setInspection(nextInspection); setStatus("更新済み"); } } catch (caught) { if (id === renderId.current) { setError(caught instanceof Error ? caught.message : String(caught)); setStatus("エラー"); } } }, [document, options]);
  useEffect(() => { Promise.all([window.mdpdf.themes(), window.mdpdf.fonts(), window.mdpdf.history()]).then(([nextThemes, nextFonts, nextHistory]) => { setThemes(nextThemes); setFonts(nextFonts); setHistory(nextHistory); }); }, []);
  useEffect(() => { const timer = window.setTimeout(render, 180); return () => window.clearTimeout(timer); }, [render]);
  useEffect(() => window.mdpdf.onDocumentChanged(async path => { if (document?.path === path) { setStatus("変更を検出"); await load(await window.mdpdf.read(path)); } }), [document?.path, load]);
  useEffect(() => window.mdpdf.onWatchError(() => setWatchStatus("監視エラー")), []);
  const exportPdf = async () => { if (!document) return; setStatus("PDFを書き出し中"); setTab("Export"); try { const next = await window.mdpdf.generatePdf(document.content, document.path, options); if (next) { setResult(next); setStatus("書き出し完了"); } else setStatus("キャンセル"); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); setStatus("エラー"); } };
  const openLine = (line: number, column = 1) => document && window.mdpdf.openEditor(document.path, line, column);
  const drop = async (file: File) => { if (/\.(md|markdown)$/i.test(file.name)) await load(await window.mdpdf.read(window.mdpdf.filePath(file))); };
  if (!document) return <Home history={history} onOpen={open} onOpenFolder={() => window.mdpdf.openFolder().then(next => next && load(next))} onRecent={path => window.mdpdf.read(path).then(load)} onDrop={drop} />;
  return <div className="app-shell"><TopBar path={document.path} status={status} watchStatus={watchStatus} onOpenEditor={() => openLine(1)} onReveal={() => window.mdpdf.reveal(document.path)} onRefresh={render} onExport={exportPdf} /><div className="workspace"><LeftSidebar document={document} inspection={inspection} history={history} active={side} onActive={setSide} onOpenLine={openLine} onHistory={path => window.mdpdf.read(path).then(load)} /><PdfPreviewPane html={html} status={status} error={error} /><RightInspector tab={tab} onTab={setTab} options={options} onOptions={setOptions} themes={themes} fonts={fonts} result={result} onExport={exportPdf} onOpenResult={() => result && window.mdpdf.openPath(result.outputPath)} onRevealResult={() => result && window.mdpdf.reveal(result.outputPath)} /></div></div>;
}
