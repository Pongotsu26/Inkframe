export interface ConvertOptions {
  theme?: string; codeTheme?: string; paper?: string; margin?: string; toc?: boolean; pageNumber?: boolean; cover?: boolean;
  orientation?: "portrait" | "landscape"; font?: { body?: string; heading?: string; code?: string };
}
export interface DocumentFile { path: string; content: string }
export interface ExportResult { outputPath: string; fileName: string; fileSize: number; pageCount?: number }
export interface PreviewResult { pages: string[]; pageCount: number }
export interface PreviewPdf { data: Uint8Array }
export interface Inspection {
  outline: Array<{ level: number; text: string; line: number }>;
  issues: Array<{ severity: "error" | "warning" | "info"; message: string; line: number; column: number }>;
  assets: Array<{ path: string; line: number; kind: string }>;
}
export interface Theme { id: string; name: string }
export interface HistoryItem { path: string; outputPath?: string; openedAt: string }
export interface MdpdfApi {
  open(): Promise<DocumentFile | undefined>; openFolder(): Promise<DocumentFile | undefined>; read(path: string): Promise<DocumentFile>;
  watch(path?: string): Promise<boolean>; inspect(content: string): Promise<Inspection>; renderPreview(content: string, path: string | undefined, options: ConvertOptions): Promise<PreviewPdf>;
  generatePdf(content: string, path: string | undefined, options: ConvertOptions): Promise<ExportResult | undefined>;
  fonts(): Promise<string[]>; themes(): Promise<Theme[]>; history(): Promise<HistoryItem[]>;
  openEditor(path: string, line?: number, column?: number): Promise<{ ok: boolean; message?: string }>;
  reveal(path: string): Promise<void>; openPath(path: string): Promise<string>; copy(value: string): Promise<void>;
  filePath(file: File): string; fileUrl(path: string): string;
  onDocumentChanged(callback: (path: string) => void): () => void; onWatchError(callback: (path: string) => void): () => void;
}
declare global { interface Window { mdpdf: MdpdfApi } }
