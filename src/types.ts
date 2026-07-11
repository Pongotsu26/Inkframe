export type Paper = "A4" | "A5" | "Letter";

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
