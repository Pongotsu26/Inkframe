#!/usr/bin/env node
import { watch as watchFile } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Command } from "commander";
import { listFonts } from "./fonts.js";
import { assertOutputPlansAreSafe, batchPdfOutputPath } from "./output-path.js";
import {
  buildMarkdownFiles,
  convertMarkdown,
  markdownFilesIn,
  mergePdfs,
  paper,
  type ConvertOptions,
} from "./renderer.js";
import type { Paper } from "./types.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

interface CliOptions extends ConvertOptions {
  bodyFont?: string;
  headingFont?: string;
  codeFont?: string;
}

function optionsConfig(options: CliOptions): ConvertOptions {
  return {
    ...options,
    paper: options.paper ? paper(options.paper) : undefined,
    font: {
      body: options.bodyFont ?? options.font?.body,
      heading: options.headingFont ?? options.font?.heading,
      code: options.codeFont ?? options.font?.code,
    },
  };
}

function report(output: string): void {
  console.log(`PDF を生成しました: ${output}`);
}

const program = new Command();
program
  .name("inkframe")
  .enablePositionalOptions()
  .description("Markdownを美しいPDFに仕上げるローカル組版CLI")
  .version(packageJson.version)
  .argument("[input]", "変換する Markdown ファイル")
  .option("-o, --output <path>", "出力 PDF のパス")
  .option("--theme <name>", "テーマ名（README のテーマ一覧を参照）")
  .option("--code-theme <name>", "Shiki のコードテーマ")
  .option("--font <family>", "本文フォント")
  .option("--body-font <family>", "本文フォント")
  .option("--heading-font <family>", "見出しフォント")
  .option("--code-font <family>", "コードフォント")
  .option("--paper <size>", "用紙サイズ（A4 / A5 / Letter）")
  .option("--margin <css>", "余白（例: 20mm 18mm）")
  .option("--toc", "目次を生成")
  .option("--no-toc", "目次を生成しない（設定ファイルを上書き）")
  .option("--page-number", "フッターにページ番号を表示")
  .option("--no-page-number", "ページ番号を表示しない（設定ファイルを上書き）")
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
  .option("--compress", "Ghostscript で PDF を圧縮")
  .option("--image-optimize", "PDF 内の画像をダウンサンプリングして最適化")
  .option("--image-quality <1-100>", "画像最適化の品質（既定: 85）", Number)
  .option(
    "--allow-external-resources",
    "外部 URL の画像・スタイル等の読み込みを許可",
  )
  .action(async (input: string | undefined, options: CliOptions) => {
    if (!input)
      throw new Error("入力する Markdown ファイルを指定してください。");
    report(await convertMarkdown(input, optionsConfig(options)));
  });

program
  .command("fonts")
  .description("利用可能なローカルフォントを一覧表示")
  .action(async () => {
    for (const font of await listFonts()) console.log(font);
  });

program
  .command("build <inputs...>")
  .description("複数の Markdown を 1 つの PDF に結合")
  .requiredOption("-o, --output <path>", "出力 PDF のパス")
  .option("--theme <name>")
  .option("--code-theme <name>")
  .option("--paper <size>")
  .option("--toc")
  .option("--page-number")
  .option("--compress")
  .option("--image-optimize")
  .option("--image-quality <1-100>", "画像最適化の品質", Number)
  .action(async (inputs: string[], options: CliOptions) =>
    report(
      await buildMarkdownFiles(inputs, options.output!, optionsConfig(options)),
    ),
  );

program
  .command("batch <directory>")
  .description("フォルダ内の Markdown を再帰的に PDF 化")
  .requiredOption("--out <directory>", "出力先ディレクトリ")
  .option("--theme <name>")
  .option("--code-theme <name>")
  .option("--paper <size>")
  .option("--toc")
  .option("--page-number")
  .option("--compress")
  .option("--image-optimize")
  .option("--image-quality <1-100>", "画像最適化の品質", Number)
  .action(async (directory: string, options: CliOptions & { out: string }) => {
    const files = await markdownFilesIn(directory);
    if (files.length === 0)
      throw new Error("Markdown ファイルが見つかりません。");
    const outputRoot = resolve(options.out);
    const plans = files.map((file) => ({
      inputPath: file,
      outputPath: batchPdfOutputPath(file, directory, outputRoot),
    }));
    await assertOutputPlansAreSafe(plans, outputRoot);
    await mkdir(outputRoot, { recursive: true });
    const stagingRoot = await mkdtemp(join(outputRoot, ".inkframe-batch-"));
    try {
      const stagingPlans = files.map((file) => ({
        inputPath: file,
        outputPath: batchPdfOutputPath(file, directory, stagingRoot),
      }));
      for (const plan of stagingPlans) {
        await convertMarkdown(plan.inputPath, {
          ...optionsConfig(options),
          output: plan.outputPath,
        });
      }
      await assertOutputPlansAreSafe(plans, outputRoot);
      for (const [index, plan] of plans.entries()) {
        await mkdir(dirname(plan.outputPath), { recursive: true });
        await rename(stagingPlans[index].outputPath, plan.outputPath);
        report(plan.outputPath);
      }
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
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

program
  .command("watch <input>")
  .description("保存時に PDF を再生成")
  .option("-o, --output <path>", "出力 PDF のパス")
  .option("--theme <name>")
  .option("--code-theme <name>")
  .option("--paper <size>")
  .option("--toc")
  .option("--page-number")
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
