export type Paper = "A4" | "A5" | "Letter";

export const DEFAULT_CODE_THEME = "github-dark";

export const CODE_THEMES = [
  { id: "github-dark", name: "GitHub Dark" },
  { id: "light-plus", name: "Light Plus" },
  { id: "dark-plus", name: "Dark Plus" },
  { id: "github-light", name: "GitHub Light" },
  { id: "nord", name: "Nord" },
  { id: "one-dark-pro", name: "One Dark Pro" },
  { id: "dracula", name: "Dracula" },
] as const;

export interface FontOptions {
  body?: string;
  heading?: string;
  code?: string;
}

export interface FontFaceOptions {
  body?: string;
  heading?: string;
  code?: string;
}

export interface PageNumberFontOptions {
  family?: string;
  face?: string;
}

export interface FontSizeOptions {
  body?: number;
  /** Legacy value used as a fallback for every heading level. */
  heading?: number;
  h1?: number;
  h2?: number;
  h3?: number;
  h4?: number;
  h5?: number;
  h6?: number;
}

export interface MdpdfConfig {
  theme?: string;
  codeTheme?: string;
  paper?: Paper;
  orientation?: "portrait" | "landscape";
  margin?: string;
  toc?: boolean;
  pageNumber?: boolean;
  pageNumberFormat?: "current" | "current-total";
  pageNumberFont?: PageNumberFontOptions;
  /** Render Mermaid fences as SVG in Chromium. Defaults to true. */
  mermaid?: boolean;
  /** Render inline and display TeX with KaTeX. Defaults to true. */
  math?: boolean;
  font?: FontOptions;
  /** Exact installed font face names, used for vendor-specific weights such as L, R, M, or DB. */
  fontFace?: FontFaceOptions;
  /** Font sizes in points. Body defaults to 10.5pt; headings use the theme unless specified. */
  fontSize?: FontSizeOptions;
  css?: string;
  header?: string;
  footer?: string;
  title?: string;
  author?: string;
  date?: string;
  subject?: string;
  keywords?: string | string[];
  language?: string;
  /** Generate a report cover from the frontmatter fields below. */
  cover?: boolean;
  course?: string;
  studentId?: string;
  instructor?: string;
  /** Permit externally hosted images and styles for this conversion. */
  allowExternalResources?: boolean;
}

export interface RenderOptions extends MdpdfConfig {
  inputPath: string;
  outputPath: string;
  mermaid?: boolean;
  math?: boolean;
}
