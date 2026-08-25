#!/usr/bin/env node
import { watch as watchFile } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import {
  mergeConfig,
  readUserConfig,
  userConfigPath,
  writeUserConfig,
} from "./config.js";
import { listFonts, type FontFamily } from "./fonts.js";
import {
  buildMarkdownFiles,
  convertMarkdown,
  markdownFilesIn,
  mergePdfs,
  paper,
  type ConvertOptions,
} from "./renderer.js";
import { listThemes } from "./themes.js";
import { CODE_THEMES } from "./types.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

interface CliOptions extends Omit<ConvertOptions, "font" | "pageNumberFont"> {
  font?: ConvertOptions["font"] | string;
  pageNumberFont?: ConvertOptions["pageNumberFont"] | string;
  bodyFont?: string;
  headingFont?: string;
  codeFont?: string;
  bodyFontFace?: string;
  headingFontFace?: string;
  codeFontFace?: string;
  pageNumberFontFamily?: string;
  pageNumberFontFace?: string;
  bodyFontSize?: number;
  headingFontSize?: number;
  h1FontSize?: number;
  h2FontSize?: number;
  h3FontSize?: number;
  h4FontSize?: number;
  h5FontSize?: number;
  h6FontSize?: number;
}

function optionsConfig(options: CliOptions): ConvertOptions {
  const {
    bodyFont,
    headingFont,
    codeFont,
    font: fontOption,
    bodyFontFace,
    headingFontFace,
    codeFontFace,
    pageNumberFont: pageNumberFontOption,
    pageNumberFontFamily,
    pageNumberFontFace,
    bodyFontSize,
    headingFontSize,
    h1FontSize,
    h2FontSize,
    h3FontSize,
    h4FontSize,
    h5FontSize,
    h6FontSize,
    ...directOptions
  } = options;
  const fontAlias = typeof fontOption === "string" ? fontOption : undefined;
  const configuredFont =
    typeof fontOption === "object" ? fontOption : undefined;
  const font = {
    ...configuredFont,
    ...(bodyFont !== undefined || fontAlias !== undefined
      ? { body: bodyFont ?? fontAlias }
      : {}),
    ...(headingFont !== undefined ? { heading: headingFont } : {}),
    ...(codeFont !== undefined ? { code: codeFont } : {}),
  };
  const fontFace = {
    ...options.fontFace,
    ...(bodyFontFace !== undefined ? { body: bodyFontFace } : {}),
    ...(headingFontFace !== undefined ? { heading: headingFontFace } : {}),
    ...(codeFontFace !== undefined ? { code: codeFontFace } : {}),
  };
  const pageNumberFontAlias =
    typeof pageNumberFontOption === "string" ? pageNumberFontOption : undefined;
  const configuredPageNumberFont =
    typeof pageNumberFontOption === "object" ? pageNumberFontOption : undefined;
  const pageNumberFont = {
    ...configuredPageNumberFont,
    ...(pageNumberFontFamily !== undefined || pageNumberFontAlias !== undefined
      ? { family: pageNumberFontFamily ?? pageNumberFontAlias }
      : {}),
    ...(pageNumberFontFace !== undefined ? { face: pageNumberFontFace } : {}),
  };
  const fontSize = {
    ...options.fontSize,
    ...(bodyFontSize !== undefined ? { body: bodyFontSize } : {}),
    ...(headingFontSize !== undefined ? { heading: headingFontSize } : {}),
    ...(h1FontSize !== undefined ? { h1: h1FontSize } : {}),
    ...(h2FontSize !== undefined ? { h2: h2FontSize } : {}),
    ...(h3FontSize !== undefined ? { h3: h3FontSize } : {}),
    ...(h4FontSize !== undefined ? { h4: h4FontSize } : {}),
    ...(h5FontSize !== undefined ? { h5: h5FontSize } : {}),
    ...(h6FontSize !== undefined ? { h6: h6FontSize } : {}),
  };

  return {
    ...directOptions,
    ...(options.paper ? { paper: paper(options.paper) } : {}),
    ...(Object.keys(font).length > 0 ? { font } : {}),
    ...(Object.keys(fontFace).length > 0 ? { fontFace } : {}),
    ...(Object.keys(pageNumberFont).length > 0 ? { pageNumberFont } : {}),
    ...(Object.keys(fontSize).length > 0 ? { fontSize } : {}),
  };
}

function fontSize(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 6 || parsed > 72)
    throw new InvalidArgumentError("6〜72の数値を指定してください。");
  return parsed;
}

function orientation(value: string): "portrait" | "landscape" {
  if (value === "portrait" || value === "landscape") return value;
  throw new InvalidArgumentError(
    "portrait または landscape を指定してください。",
  );
}

function pageNumberFormat(value: string): "current" | "current-total" {
  if (value === "current" || value === "current-total") return value;
  throw new InvalidArgumentError(
    "current または current-total を指定してください。",
  );
}

function addTypesettingOptions(command: Command): Command {
  return command
    .option("--theme <name>", "テーマ名（README のテーマ一覧を参照）")
    .option("--code-theme <name>", "Shiki のコードテーマ")
    .option("--font <family>", "本文フォント")
    .option("--body-font <family>", "本文フォント")
    .option("--heading-font <family>", "見出しフォント")
    .option("--code-font <family>", "コードフォント")
    .option("--body-font-face <face>", "本文フォントのフェイス")
    .option("--heading-font-face <face>", "見出しフォントのフェイス")
    .option("--code-font-face <face>", "コードフォントのフェイス")
    .option("--body-font-size <pt>", "本文サイズ（6〜72pt）", fontSize)
    .option("--heading-font-size <pt>", "見出し共通サイズ（6〜72pt）", fontSize)
    .option("--h1-font-size <pt>", "H1 サイズ（6〜72pt）", fontSize)
    .option("--h2-font-size <pt>", "H2 サイズ（6〜72pt）", fontSize)
    .option("--h3-font-size <pt>", "H3 サイズ（6〜72pt）", fontSize)
    .option("--h4-font-size <pt>", "H4 サイズ（6〜72pt）", fontSize)
    .option("--h5-font-size <pt>", "H5 サイズ（6〜72pt）", fontSize)
    .option("--h6-font-size <pt>", "H6 サイズ（6〜72pt）", fontSize)
    .option("--paper <size>", "用紙サイズ（A4 / A5 / Letter）")
    .option(
      "--orientation <direction>",
      "用紙の向き（portrait / landscape）",
      orientation,
    )
    .option("--margin <css>", "余白（例: 20mm 18mm）")
    .option("--toc", "目次を生成")
    .option("--no-toc", "目次を生成しない")
    .option("--page-number", "フッターにページ番号を表示")
    .option("--no-page-number", "ページ番号を表示しない")
    .option(
      "--page-number-format <format>",
      "ページ番号形式（current / current-total）",
      pageNumberFormat,
    )
    .option("--page-number-font <family>", "ページ番号のフォント")
    .option("--page-number-font-family <family>", "ページ番号のフォント")
    .option("--page-number-font-face <face>", "ページ番号フォントのフェイス")
    .option("--header <html>", "ヘッダー HTML")
    .option("--footer <html>", "フッター HTML")
    .option("--css <path>", "追加 CSS ファイル")
    .option("--mermaid", "Mermaid の SVG レンダリングを有効化")
    .option("--no-mermaid", "Mermaid の SVG レンダリングを無効化")
    .option("--math", "KaTeX による数式レンダリングを有効化")
    .option("--no-math", "KaTeX による数式レンダリングを無効化")
    .option("--line-breaks", "Markdown内の改行をHTMLの改行として反映")
    .option("--no-line-breaks", "Markdown内の改行を段落内では無視")
    .option("--cover", "Frontmatter から表紙を生成")
    .option("--no-cover", "表紙を生成しない")
    .option(
      "--allow-external-resources",
      "外部 URL の画像・スタイル等の読み込みを許可",
    )
    .option(
      "--no-allow-external-resources",
      "外部 URL の画像・スタイル等の読み込みを許可しない",
    );
}

function persistentConfig(options: CliOptions): ConvertOptions {
  const {
    output: _output,
    compress: _compress,
    imageOptimize: _imageOptimize,
    imageQuality: _imageQuality,
    ...config
  } = optionsConfig(options);
  return config;
}

function report(output: string): void {
  console.log(`PDF を生成しました: ${output}`);
}

async function outputFor(input: string, outDirectory: string): Promise<string> {
  await mkdir(resolve(outDirectory), { recursive: true });
  return join(
    resolve(outDirectory),
    `${basename(input).replace(/\.(?:md|markdown)$/i, "")}.pdf`,
  );
}

const CONFIG_OPTION_KEYS = [
  "theme",
  "code-theme",
  "paper",
  "orientation",
  "margin",
  "font",
  "font-face",
  "font-size",
  "toc",
  "page-number",
  "page-number-format",
  "header",
  "footer",
  "css",
  "mermaid",
  "math",
  "line-breaks",
  "cover",
  "external-resources",
] as const;

function printFonts(fonts: FontFamily[], includeFaces = true): void {
  for (const font of fonts) {
    console.log(font.family);
    if (includeFaces)
      for (const face of font.faces)
        console.log(`  ${face.name} (${face.style})`);
  }
}

async function printConfigOptions(key?: string, value?: string): Promise<void> {
  const themes = await listThemes();
  const themeIds = themes.map((theme) => theme.id).join(" | ");
  const codeThemeIds = CODE_THEMES.map((theme) => theme.id).join(" | ");
  const summaries: Record<(typeof CONFIG_OPTION_KEYS)[number], string> = {
    theme: themeIds,
    "code-theme": codeThemeIds,
    paper: "A4 | A5 | Letter",
    orientation: "portrait | landscape",
    margin: 'CSS形式の長さを1〜4個（例: "20mm 18mm"）',
    font: "端末にインストール済みのフォントファミリー",
    "font-face": "選択したファミリーに含まれるフォントフェイス",
    "font-size": "6〜72pt（0.5刻みも指定可能）",
    toc: "true (--toc) | false (--no-toc)",
    "page-number": "true (--page-number) | false (--no-page-number)",
    "page-number-format": "current | current-total",
    header: "HTML文字列",
    footer: "HTML文字列",
    css: "追加CSSファイルのパス",
    mermaid: "true (--mermaid) | false (--no-mermaid)",
    math: "true (--math) | false (--no-math)",
    "line-breaks": "true (--line-breaks) | false (--no-line-breaks)",
    cover: "true (--cover) | false (--no-cover)",
    "external-resources":
      "true (--allow-external-resources) | false (--no-allow-external-resources)",
  };

  if (!key) {
    console.log("設定項目と指定可能な値:");
    for (const optionKey of CONFIG_OPTION_KEYS)
      console.log(`  ${optionKey.padEnd(20)} ${summaries[optionKey]}`);
    console.log("\n詳細: inkframe config options <項目>");
    return;
  }

  if (!CONFIG_OPTION_KEYS.includes(key as (typeof CONFIG_OPTION_KEYS)[number]))
    throw new Error(
      `設定項目が不明です: ${key}\n選択可能: ${CONFIG_OPTION_KEYS.join(", ")}`,
    );

  if (key === "theme") {
    for (const theme of themes)
      console.log(
        `${theme.id}\n  ${theme.name}${theme.description ? ` — ${theme.description}` : ""}`,
      );
    return;
  }

  if (key === "code-theme") {
    for (const theme of CODE_THEMES)
      console.log(`${theme.id}\n  ${theme.name}`);
    return;
  }

  if (key === "font") {
    printFonts(await listFonts(), false);
    return;
  }

  if (key === "font-face") {
    const fonts = await listFonts();
    const selected = value
      ? fonts.filter(
          (font) =>
            font.family.toLocaleLowerCase() === value.toLocaleLowerCase(),
        )
      : fonts;
    if (selected.length === 0)
      throw new Error(
        `フォントファミリーが見つかりません: ${value}\n候補は inkframe config options font で確認できます。`,
      );
    printFonts(selected);
    return;
  }

  console.log(`${key}: ${summaries[key as keyof typeof summaries]}`);
}

const program = new Command();
program
  .name("inkframe")
  .enablePositionalOptions()
  .description("Markdownを美しいPDFに仕上げるローカル組版CLI")
  .version(packageJson.version)
  .argument("[input]", "変換する Markdown ファイル");

addTypesettingOptions(program)
  .option("-o, --output <path>", "出力 PDF のパス")
  .option("--compress", "Ghostscript で PDF を圧縮")
  .option("--image-optimize", "PDF 内の画像をダウンサンプリングして最適化")
  .option("--image-quality <1-100>", "画像最適化の品質（既定: 85）", Number)
  .action(async (input: string | undefined, options: CliOptions) => {
    if (!input)
      throw new Error("入力する Markdown ファイルを指定してください。");
    report(await convertMarkdown(input, optionsConfig(options)));
  });

program
  .command("fonts")
  .description("利用可能なローカルフォントを一覧表示")
  .action(async () => {
    printFonts(await listFonts());
  });

const configCommand = program
  .command("config")
  .description("CLIのユーザー共通デフォルト設定を管理");

configCommand
  .command("path")
  .description("ユーザー設定ファイルのパスを表示")
  .action(() => console.log(userConfigPath()));

configCommand
  .command("show")
  .description("ユーザー共通デフォルト設定を表示")
  .action(async () => {
    console.log(JSON.stringify(await readUserConfig(), null, 2));
  });

configCommand
  .command("options [key] [value]")
  .description("設定可能な項目と選択肢を表示")
  .action((key?: string, value?: string) => printConfigOptions(key, value));

const setConfigCommand = configCommand
  .command("set")
  .description("指定した項目をユーザー共通デフォルトとして保存");
addTypesettingOptions(setConfigCommand).action(async (options: CliOptions) => {
  const updates = persistentConfig(options);
  if (Object.keys(updates).length === 0)
    throw new Error("保存する設定項目を1つ以上指定してください。");
  const next = mergeConfig(await readUserConfig(), updates);
  await writeUserConfig(next);
  console.log(`デフォルト設定を保存しました: ${userConfigPath()}`);
});

configCommand
  .command("reset")
  .description("ユーザー共通デフォルト設定を組み込み初期値へ戻す")
  .action(async () => {
    await writeUserConfig({});
    console.log(`デフォルト設定を初期化しました: ${userConfigPath()}`);
  });

const buildCommand = program
  .command("build <inputs...>")
  .description("複数の Markdown を 1 つの PDF に結合")
  .requiredOption("-o, --output <path>", "出力 PDF のパス");
addTypesettingOptions(buildCommand)
  .option("--compress")
  .option("--image-optimize")
  .option("--image-quality <1-100>", "画像最適化の品質", Number)
  .action(async (inputs: string[], options: CliOptions) =>
    report(
      await buildMarkdownFiles(inputs, options.output!, optionsConfig(options)),
    ),
  );

const batchCommand = program
  .command("batch <directory>")
  .description("フォルダ内の Markdown を再帰的に PDF 化")
  .requiredOption("--out <directory>", "出力先ディレクトリ");
addTypesettingOptions(batchCommand)
  .option("--compress")
  .option("--image-optimize")
  .option("--image-quality <1-100>", "画像最適化の品質", Number)
  .action(async (directory: string, options: CliOptions & { out: string }) => {
    const files = await markdownFilesIn(directory);
    if (files.length === 0)
      throw new Error("Markdown ファイルが見つかりません。");
    for (const file of files)
      report(
        await convertMarkdown(file, {
          ...optionsConfig(options),
          output: await outputFor(file, options.out),
        }),
      );
  });

program
  .command("merge <inputs...>")
  .description("生成済み PDF を 1 つに結合")
  .requiredOption("-o, --output <path>", "出力 PDF のパス")
  .action(async (inputs: string[], options: { output: string }) => {
    await mergePdfs(
      inputs.map((input) => resolve(input)),
      resolve(options.output),
    );
    console.log(`PDF を結合しました: ${resolve(options.output)}`);
  });

const watchCommand = program
  .command("watch <input>")
  .description("保存時に PDF を再生成")
  .option("-o, --output <path>", "出力 PDF のパス");
addTypesettingOptions(watchCommand)
  .option("--compress")
  .action(async (input: string, options: CliOptions) => {
    let timer: NodeJS.Timeout | undefined;
    const generate = async (): Promise<void> => {
      try {
        report(await convertMarkdown(input, optionsConfig(options)));
      } catch (error) {
        console.error(
          error instanceof Error ? `エラー: ${error.message}` : error,
        );
      }
    };
    await generate();
    console.log(`監視中: ${resolve(input)}（Ctrl+C で終了）`);
    watchFile(resolve(input), () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void generate(), 250);
    });
  });

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? `エラー: ${error.message}` : error);
  process.exitCode = 1;
});
