export type Paper = "A4" | "A5" | "Letter";

export const DEFAULT_CODE_THEME = "github-dark";

export const CODE_THEMES = [
  { id: "github-dark", name: "GitHub Dark" },
  { id: "light-plus", name: "Light Plus" },
  { id: "dark-plus", name: "Dark Plus" },
  { id: "github-light", name: "GitHub Light" },
  { id: "nord", name: "Nord" },
  { id: "one-dark-pro", name: "One Dark Pro" },
  { id: "dracula", name: "Dracula" }
] as const;

export interface FontOptions {
  body?: string;
  heading?: string;
  code?: string;
}

export interface MdpdfConfig {
  theme?: string;
  codeTheme?: string;
  paper?: Paper;
  margin?: string;
  toc?: boolean;
  pageNumber?: boolean;
  /** Render Mermaid fences as SVG in Chromium. Defaults to true. */
  mermaid?: boolean;
  /** Render inline and display TeX with KaTeX. Defaults to true. */
  math?: boolean;
  font?: FontOptions;
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
