export interface ConvertOptions {
  theme?: string;
  codeTheme?: string;
  paper?: string;
  margin?: string;
  toc?: boolean;
  pageNumber?: boolean;
  pageNumberFormat?: "current" | "current-total";
  pageNumberFont?: { family?: string; face?: string };
  cover?: boolean;
  orientation?: "portrait" | "landscape";
  lineBreaks?: boolean;
  themeSettingsMode?: "theme" | "app";
  font?: { body?: string; heading?: string; code?: string };
  fontFace?: { body?: string; heading?: string; code?: string };
  fontSize?: {
    body?: number;
    heading?: number;
    h1?: number;
    h2?: number;
    h3?: number;
    h4?: number;
    h5?: number;
    h6?: number;
  };
  mermaid?: boolean;
  math?: boolean;
  css?: string;
  header?: string;
  footer?: string;
  title?: string;
  author?: string;
  date?: string;
  subject?: string;
  keywords?: string | string[];
  language?: string;
  course?: string;
  studentId?: string;
  instructor?: string;
  allowExternalResources?: boolean;
}
export interface DocumentFile {
  path: string;
  content: string;
}
export interface ExportResult {
  outputPath: string;
  fileName: string;
  fileSize: number;
  pageCount?: number;
}
export interface PreviewHtml {
  pdfData: string;
}
export interface Inspection {
  outline: Array<{ level: number; text: string; line: number }>;
  issues: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    line: number;
    column: number;
  }>;
  assets: Array<{ path: string; line: number; kind: string }>;
}
export interface Theme {
  id: string;
  name: string;
  description?: string;
  paper?: string;
  orientation?: "portrait" | "landscape";
  custom?: boolean;
  cssPath?: string;
  defaults?: ConvertOptions;
}
export interface AppSettings {
  defaultTheme?: string;
  defaultOptions?: ConvertOptions;
  language?: "en" | "ja";
  editor?: string;
}
export interface EditorInfo {
  id: string;
  name: string;
  icon?: string;
}
export interface FontFamily {
  family: string;
  faces: Array<{ name: string; style: string }>;
}
export interface HistoryItem {
  path: string;
  outputPath?: string;
  openedAt: string;
}
export interface MdpdfApi {
  open(): Promise<DocumentFile | undefined>;
  openFolder(): Promise<DocumentFile | undefined>;
  read(path: string): Promise<DocumentFile>;
  resolveOptions(path: string, content: string): Promise<ConvertOptions>;
  watch(path?: string): Promise<boolean>;
  inspect(content: string): Promise<Inspection>;
  renderPreview(
    content: string,
    path: string | undefined,
    options: ConvertOptions,
  ): Promise<PreviewHtml>;
  generatePdf(
    content: string,
    path: string | undefined,
    options: ConvertOptions,
  ): Promise<ExportResult | undefined>;
  fonts(): Promise<FontFamily[]>;
  editors(): Promise<EditorInfo[]>;
  themes(): Promise<Theme[]>;
  history(): Promise<HistoryItem[]>;
  createTheme(
    name: string,
    sourceTheme?: string,
    defaults?: ConvertOptions,
  ): Promise<Theme>;
  editTheme(cssPath: string): Promise<{ ok: boolean; message?: string }>;
  deleteTheme(cssPath: string): Promise<void>;
  importTheme(): Promise<Theme | undefined>;
  exportTheme(cssPath: string): Promise<boolean>;
  settings(): Promise<AppSettings>;
  setDefaultTheme(theme?: string): Promise<AppSettings>;
  setDefaultOptions(
    options: ConvertOptions,
    preferences?: Pick<AppSettings, "language" | "editor">,
  ): Promise<AppSettings>;
  openEditor(
    path: string,
    line?: number,
    column?: number,
    editor?: string,
  ): Promise<{ ok: boolean; message?: string }>;
  reveal(path: string): Promise<void>;
  openPath(path: string): Promise<string>;
  copy(value: string): Promise<void>;
  filePath(file: File): string;
  fileUrl(path: string): string;
  onDocumentChanged(callback: (path: string) => void): () => void;
  onWatchError(callback: (path: string) => void): () => void;
  onOpenSettings(callback: () => void): () => void;
  onMenuAction(callback: (action: string, value?: unknown) => void): () => void;
  updateMenuDocumentOptions(
    options: Pick<ConvertOptions, "toc" | "cover" | "pageNumber">,
  ): Promise<void>;
}
declare global {
  interface Window {
    mdpdf: MdpdfApi;
  }
}
