import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertOutputDoesNotOverwriteInputs,
  assertOutputPlansAreSafe,
  batchPdfOutputPath,
  pdfOutputPathFor,
} from "../src/output-path.js";
import {
  buildMarkdownFiles,
  compressPdf,
  convertMarkdown,
  mergePdfs,
} from "../src/renderer.js";

describe("PDF output path safety", () => {
  it("Markdown拡張子だけを置換し、未知の拡張子にはPDF拡張子を追加する", () => {
    expect(pdfOutputPathFor("report.md")).toBe("report.pdf");
    expect(pdfOutputPathFor("report.MARKDOWN")).toBe("report.pdf");
    expect(pdfOutputPathFor("report.txt")).toBe("report.txt.pdf");
    expect(pdfOutputPathFor("report")).toBe("report.pdf");
  });

  it("batch出力で探索ルートからの相対階層を維持する", () => {
    const inputRoot = join(tmpdir(), "inkframe-batch-source");
    const outputRoot = join(tmpdir(), "inkframe-batch-output");
    const input = join(inputRoot, "chapters", "intro.md");

    expect(batchPdfOutputPath(input, inputRoot, outputRoot)).toBe(
      join(outputRoot, "chapters", "intro.pdf"),
    );
  });

  it("探索ルート外のファイルをbatch出力へ割り当てない", () => {
    const inputRoot = join(tmpdir(), "inkframe-batch-source");
    const outside = join(dirname(inputRoot), "outside.md");

    expect(() =>
      batchPdfOutputPath(outside, inputRoot, join(tmpdir(), "output")),
    ).toThrow("探索ルートの外側");
  });

  it("同じ出力へ割り当てられるbatch入力を変換前に拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-collision-"));
    const markdown = join(directory, "chapter.md");
    const longMarkdown = join(directory, "chapter.markdown");
    const outputRoot = join(directory, "output");
    await writeFile(markdown, "# Short extension");
    await writeFile(longMarkdown, "# Long extension");
    const plans = [markdown, longMarkdown].map((inputPath) => ({
      inputPath,
      outputPath: batchPdfOutputPath(inputPath, directory, outputRoot),
    }));

    await expect(assertOutputPlansAreSafe(plans)).rejects.toThrow("同じ出力先");
  });

  it("一方が親ファイルになるbatch出力を変換前に拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-parent-file-"));
    const firstInput = join(directory, "chapter.md");
    const secondInput = join(directory, "nested.md");
    const outputRoot = join(directory, "output");
    await writeFile(firstInput, "# First");
    await writeFile(secondInput, "# Second");

    await expect(
      assertOutputPlansAreSafe([
        {
          inputPath: firstInput,
          outputPath: join(outputRoot, "chapter.pdf"),
        },
        {
          inputPath: secondInput,
          outputPath: join(outputRoot, "chapter.pdf", "nested.pdf"),
        },
      ]),
    ).rejects.toThrow("親ファイル");
  });

  it("既存ディレクトリや既存ファイル配下をPDF出力先にしない", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-output-kind-"));
    const input = join(directory, "source.md");
    const outputDirectory = join(directory, "existing-directory.pdf");
    const parentFile = join(directory, "parent.pdf");
    await writeFile(input, "# Source");
    await mkdir(outputDirectory);
    await writeFile(parentFile, "not a directory");

    await expect(
      assertOutputPlansAreSafe([
        { inputPath: input, outputPath: outputDirectory },
      ]),
    ).rejects.toThrow("ディレクトリは指定できません");
    await expect(
      assertOutputPlansAreSafe([
        {
          inputPath: input,
          outputPath: join(parentFile, "nested.pdf"),
        },
      ]),
    ).rejects.toThrow("親パスがディレクトリではありません");
  });

  it.skipIf(process.platform === "win32")(
    "出力ルート内のシンボリックリンクから外側へ書き出さない",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "inkframe-root-escape-"));
      const input = join(directory, "source.md");
      const outputRoot = join(directory, "output");
      const outside = join(directory, "outside");
      await writeFile(input, "# Protected");
      await Promise.all([mkdir(outputRoot), mkdir(outside)]);
      await symlink(outside, join(outputRoot, "escape"));

      await expect(
        assertOutputPlansAreSafe(
          [
            {
              inputPath: input,
              outputPath: join(outputRoot, "escape", "source.pdf"),
            },
          ],
          outputRoot,
        ),
      ).rejects.toThrow("出力ルートの外側");
    },
  );

  it.skipIf(process.platform === "win32")(
    "出力ルート内のdangling symlinkから外側へ書き出さない",
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "inkframe-dangling-root-"),
      );
      const input = join(directory, "source.md");
      const outputRoot = join(directory, "output");
      const outsideOutput = join(directory, "outside", "source.pdf");
      await writeFile(input, "# Protected");
      await mkdir(outputRoot);
      await symlink(outsideOutput, join(outputRoot, "source.pdf"));

      await expect(
        assertOutputPlansAreSafe(
          [
            {
              inputPath: input,
              outputPath: join(outputRoot, "source.pdf"),
            },
          ],
          outputRoot,
        ),
      ).rejects.toThrow("出力ルートの外側");
    },
  );

  it.skipIf(process.platform === "win32")(
    "同じ未作成targetを指すdangling symlink同士を衝突として拒否する",
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "inkframe-dangling-pair-"),
      );
      const firstInput = join(directory, "first.md");
      const secondInput = join(directory, "second.md");
      const sharedOutput = join(directory, "outside", "shared.pdf");
      const firstOutput = join(directory, "first.pdf");
      const secondOutput = join(directory, "second.pdf");
      await writeFile(firstInput, "# First");
      await writeFile(secondInput, "# Second");
      await symlink(sharedOutput, firstOutput);
      await symlink(sharedOutput, secondOutput);

      await expect(
        assertOutputPlansAreSafe([
          { inputPath: firstInput, outputPath: firstOutput },
          { inputPath: secondInput, outputPath: secondOutput },
        ]),
      ).rejects.toThrow("同じ出力先");
    },
  );

  it.runIf(process.platform === "darwin" || process.platform === "win32")(
    "大文字小文字だけが異なる未作成のbatch出力も衝突として拒否する",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "inkframe-case-path-"));
      const firstInput = join(directory, "first.md");
      const secondInput = join(directory, "second.md");
      await writeFile(firstInput, "# First");
      await writeFile(secondInput, "# Second");

      await expect(
        assertOutputPlansAreSafe([
          { inputPath: firstInput, outputPath: join(directory, "Foo.pdf") },
          { inputPath: secondInput, outputPath: join(directory, "foo.pdf") },
        ]),
      ).rejects.toThrow("同じ出力先");
    },
  );

  it("同一パスと同一inodeへの出力を拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-same-file-"));
    const input = join(directory, "report.md");
    const hardLink = join(directory, "report-link.pdf");
    await writeFile(input, "# Protected");
    await link(input, hardLink);

    await expect(
      assertOutputDoesNotOverwriteInputs([input], input),
    ).rejects.toThrow("入力ファイルと同じ");
    await expect(
      assertOutputDoesNotOverwriteInputs([input], hardLink),
    ).rejects.toThrow("入力ファイルと同じ");
  });

  it.skipIf(process.platform === "win32")(
    "シンボリックリンク経由の同一入力も拒否する",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "inkframe-symlink-"));
      const input = join(directory, "report.md");
      const outputLink = join(directory, "report-link.pdf");
      await writeFile(input, "# Protected");
      await symlink(input, outputLink);

      await expect(
        assertOutputDoesNotOverwriteInputs([input], outputLink),
      ).rejects.toThrow("入力ファイルと同じ");
    },
  );

  it("単一変換で明示された同一出力を描画前に拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-convert-safe-"));
    const input = join(directory, "report.md");
    const original = "# Protected Markdown";
    await writeFile(input, original);

    await expect(convertMarkdown(input, { output: input })).rejects.toThrow(
      "入力ファイルと同じ",
    );
    expect(await readFile(input, "utf8")).toBe(original);
  });

  it("buildとmergeも入力自身への出力を事前に拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-combine-safe-"));
    const markdown = join(directory, "source.md");
    const pdf = join(directory, "source.pdf");
    await writeFile(markdown, "# Protected Markdown");
    await writeFile(pdf, "protected pdf placeholder");

    await expect(buildMarkdownFiles([markdown], markdown)).rejects.toThrow(
      "入力ファイルと同じ",
    );
    await expect(mergePdfs([pdf], pdf)).rejects.toThrow("入力ファイルと同じ");
    expect(await readFile(markdown, "utf8")).toBe("# Protected Markdown");
    expect(await readFile(pdf, "utf8")).toBe("protected pdf placeholder");
  });

  it("compressも同じPDFへの直接出力をGhostscript実行前に拒否する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-compress-safe-"));
    const pdf = join(directory, "source.pdf");
    const original = "protected pdf placeholder";
    await writeFile(pdf, original);

    await expect(compressPdf(pdf, pdf)).rejects.toThrow("入力ファイルと同じ");
    const hardLink = join(directory, "hard-link.pdf");
    await link(pdf, hardLink);
    await expect(compressPdf(pdf, hardLink)).rejects.toThrow(
      "入力ファイルと同じ",
    );
    if (process.platform !== "win32") {
      const symbolicLink = join(directory, "symbolic-link.pdf");
      await symlink(pdf, symbolicLink);
      await expect(compressPdf(pdf, symbolicLink)).rejects.toThrow(
        "入力ファイルと同じ",
      );
    }
    expect(await readFile(pdf, "utf8")).toBe(original);
  });
});
