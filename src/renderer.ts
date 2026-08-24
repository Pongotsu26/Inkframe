import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import matter from "gray-matter";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright";
import { findConfig, mergeConfig } from "./config.js";
import { markdownToHtml } from "./html.js";
import {
  assertOutputDoesNotOverwriteInputs,
  pdfOutputPathFor,
} from "./output-path.js";
import { pageDimensionsPoints, pageSizeCss } from "./page-size.js";
import { DEFAULT_CODE_THEME, type MdpdfConfig, type Paper } from "./types.js";

const execFileAsync = promisify(execFile);

export interface ConvertOptions extends MdpdfConfig {
  output?: string;
  imageOptimize?: boolean;
  imageQuality?: number;
  compress?: boolean;
}

function margins(value: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1)
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2)
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3)
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  if (parts.length === 4)
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  throw new Error(
    "余白は CSS と同じ形式で 1〜4 個の値を指定してください（例: 20mm 18mm）",
  );
}

function headerTemplate(value?: string): string {
  return `<div style="width:100%;font-size:8px;color:#666;padding:0 12mm;text-align:center">${value ?? ""}</div>`;
}

export function footerTemplate(
  value?: string,
  pageNumber?: boolean,
  format: "current" | "current-total" = "current-total",
  font?: string,
): string {
  const pageText =
    format === "current"
      ? '<span class="pageNumber"></span>'
      : '<span class="pageNumber"></span>/<span class="totalPages"></span>';
  const text = value ?? (pageNumber ? pageText : "");
  const fontFamily = font
    ? `font-family:&quot;${font.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}&quot;;`
    : "";
  return `<div style="width:100%;font-size:8px;${fontFamily}color:#666;padding:0 12mm;text-align:center">${text}</div>`;
}

async function readFrontmatter(inputPath: string): Promise<MdpdfConfig> {
  return matter(await readFile(inputPath, "utf8")).data as MdpdfConfig;
}

export async function normalizePdfPageSize(
  path: string,
  paper: Paper,
  orientation: "portrait" | "landscape" = "portrait",
): Promise<void> {
  const pdf = await PDFDocument.load(await readFile(path));
  const target = pageDimensionsPoints(paper, orientation);
  for (const page of pdf.getPages()) {
    const current = page.getSize();
    page.scale(target.width / current.width, target.height / current.height);
  }
  await writeFile(path, await pdf.save());
}

export async function resolvedConfig(
  inputPath: string,
  options: ConvertOptions = {},
): Promise<MdpdfConfig> {
  return mergeConfig(
    {
      theme: "github",
      codeTheme: DEFAULT_CODE_THEME,
      paper: "A4",
      margin: "18mm",
      toc: false,
      pageNumber: false,
      mermaid: true,
      math: true,
      fontSize: { body: 10.5 },
    },
    await findConfig(inputPath),
    await readFrontmatter(inputPath),
    options,
  );
}

async function ghostscript(args: string[]): Promise<void> {
  try {
    await execFileAsync("gs", args, { maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error(
      `Ghostscript を実行できません。PDF の結合・圧縮には Ghostscript をインストールしてください。${error instanceof Error ? `\n${error.message}` : ""}`,
    );
  }
}

async function writePdfAtomically(
  outputPath: string,
  writeTemporaryPdf: (temporaryOutput: string) => Promise<void>,
): Promise<void> {
  const resolvedOutput = resolve(outputPath);
  await mkdir(dirname(resolvedOutput), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    join(dirname(resolvedOutput), ".inkframe-output-"),
  );
  const temporaryOutput = join(temporaryDirectory, "output.pdf");
  try {
    await writeTemporaryPdf(temporaryOutput);
    await rename(temporaryOutput, resolvedOutput);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function mergePdfs(
  inputs: string[],
  outputPath: string,
): Promise<void> {
  if (inputs.length === 0) throw new Error("結合する PDF を指定してください。");
  await assertOutputDoesNotOverwriteInputs(inputs, outputPath);
  await writePdfAtomically(outputPath, (temporaryOutput) =>
    ghostscript([
      "-q",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${temporaryOutput}`,
      ...inputs,
    ]),
  );
}

async function writeCompressedPdf(
  inputPath: string,
  outputPath: string,
  imageQuality?: number,
): Promise<void> {
  const quality = Math.max(1, Math.min(100, imageQuality ?? 85));
  const resolution = Math.round(72 + quality * 1.8);
  await ghostscript([
    "-q",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.4",
    "-dPDFSETTINGS=/printer",
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    "-dDownsampleMonoImages=true",
    `-dColorImageResolution=${resolution}`,
    `-dGrayImageResolution=${resolution}`,
    `-sOutputFile=${outputPath}`,
    inputPath,
  ]);
}

export async function compressPdf(
  inputPath: string,
  outputPath: string,
  imageQuality?: number,
): Promise<void> {
  await assertOutputDoesNotOverwriteInputs([inputPath], outputPath);
  await writePdfAtomically(outputPath, (temporaryOutput) =>
    writeCompressedPdf(inputPath, temporaryOutput, imageQuality),
  );
}

async function optimizePdfInPlace(
  outputPath: string,
  imageQuality?: number,
): Promise<void> {
  await writePdfAtomically(outputPath, (temporaryOutput) =>
    writeCompressedPdf(outputPath, temporaryOutput, imageQuality),
  );
}

/** Convert one Markdown document entirely on the local machine. */
export async function convertMarkdown(
  input: string,
  options: ConvertOptions = {},
): Promise<string> {
  const inputPath = resolve(input);
  const outputPath = resolve(options.output ?? pdfOutputPathFor(inputPath));
  await assertOutputDoesNotOverwriteInputs([inputPath], outputPath);
  const settings = await resolvedConfig(inputPath, options);
  const document = await markdownToHtml(inputPath, settings);
  const pageSize = pageSizeCss(
    settings.paper ?? "A4",
    settings.orientation ?? "portrait",
  );
  await writePdfAtomically(outputPath, async (temporaryOutput) => {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        `Chromium を起動できません。\`npx playwright install chromium\` を実行してください。\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      const page = await browser.newPage();
      if (!settings.allowExternalResources) {
        await page.route("**/*", (route) =>
          /^(?:file:|data:|blob:|about:)/.test(route.request().url())
            ? route.continue()
            : route.abort(),
        );
      }
      const printDocument = document.html.replace(
        "</head>",
        `<style id="inkframe-print-page-size">@page { size: ${pageSize}; }</style></head>`,
      );
      await page.setContent(printDocument, { waitUntil: "load" });
      if (
        settings.mermaid !== false &&
        document.html.includes('class="mermaid"')
      ) {
        await page.addScriptTag({ path: document.mermaidScriptPath });
        await page.evaluate(async () => {
          const mermaid = (
            window as unknown as {
              mermaid: {
                initialize: (config: object) => void;
                run: () => Promise<void>;
              };
            }
          ).mermaid;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "neutral",
          });
          await mermaid.run();
        });
      }
      await page.evaluate(() => window.document.fonts.ready);
      await page.pdf({
        path: temporaryOutput,
        printBackground: true,
        preferCSSPageSize: true,
        margin: margins(settings.margin ?? "18mm"),
        displayHeaderFooter: Boolean(
          settings.pageNumber || settings.header || settings.footer,
        ),
        headerTemplate: headerTemplate(settings.header),
        footerTemplate: footerTemplate(
          settings.footer,
          settings.pageNumber,
          settings.pageNumberFormat,
          settings.pageNumberFont?.face ?? settings.pageNumberFont?.family,
        ),
        tagged: true,
        outline: true,
      });
    } finally {
      await browser.close();
    }

    if (options.compress || options.imageOptimize) {
      await optimizePdfInPlace(
        temporaryOutput,
        options.imageOptimize ? options.imageQuality : undefined,
      );
    }
    await normalizePdfPageSize(
      temporaryOutput,
      settings.paper ?? "A4",
      settings.orientation ?? "portrait",
    );
  });
  return outputPath;
}

export async function buildMarkdownFiles(
  inputs: string[],
  output: string,
  options: ConvertOptions = {},
): Promise<string> {
  if (inputs.length === 0)
    throw new Error("結合する Markdown ファイルを指定してください。");
  const outputPath = resolve(output);
  await assertOutputDoesNotOverwriteInputs(inputs, outputPath);
  const temporary = await mkdtemp(join(tmpdir(), "mdpdf-build-"));
  try {
    const generated: string[] = [];
    for (const [index, input] of inputs.entries()) {
      const pdf = join(temporary, `${String(index + 1).padStart(3, "0")}.pdf`);
      generated.push(
        await convertMarkdown(input, {
          ...options,
          output: pdf,
          compress: false,
          imageOptimize: false,
        }),
      );
    }
    await mergePdfs(generated, outputPath);
    if (options.compress || options.imageOptimize) {
      await optimizePdfInPlace(
        outputPath,
        options.imageOptimize ? options.imageQuality : undefined,
      );
    }
    return outputPath;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function markdownFilesIn(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (
        entry.isFile() &&
        /\.(?:md|markdown)$/i.test(extname(entry.name))
      )
        result.push(path);
    }
  }
  await walk(resolve(directory));
  return result.sort();
}

export function paper(value: string): Paper {
  if (value === "A4" || value === "A5" || value === "Letter") return value;
  throw new Error("用紙サイズは A4、A5、Letter のいずれかを指定してください。");
}
