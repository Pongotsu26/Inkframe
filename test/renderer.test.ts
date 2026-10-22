import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  convertMarkdown,
  footerTemplate,
  markdownFilesIn,
  normalizePdfPageSize,
  paper,
  resolvedConfig,
} from "../src/renderer.js";

const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACUAAAAXCAIAAAADThHyAAAAJ0lEQVR4nOzNMQ0AAAgDMELwbxkccO5qDXS2orqyfD6fz+fz+Xy/AwAA//+u7JJRAAAABklEQVQDABVGATCacDxcAAAAAElFTkSuQmCC",
  "base64",
);

describe("Phase 2 renderer utilities", () => {
  let originalConfigHome: string | undefined;

  beforeEach(async () => {
    originalConfigHome = process.env.INKFRAME_CONFIG_HOME;
    process.env.INKFRAME_CONFIG_HOME = await mkdtemp(
      join(tmpdir(), "inkframe-renderer-config-"),
    );
  });

  afterEach(() => {
    if (originalConfigHome === undefined)
      delete process.env.INKFRAME_CONFIG_HOME;
    else process.env.INKFRAME_CONFIG_HOME = originalConfigHome;
  });

  it("フォルダ内の Markdown を再帰的に列挙する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-batch-"));
    await mkdir(join(directory, "nested"));
    await writeFile(join(directory, "a.md"), "# A");
    await writeFile(join(directory, "nested", "b.markdown"), "# B");
    await writeFile(join(directory, "nested", "skip.txt"), "skip");
    expect(
      (await markdownFilesIn(directory)).map((path) =>
        path.replace(directory, ""),
      ),
    ).toEqual(["/a.md", "/nested/b.markdown"]);
  });

  it("許可された用紙サイズだけを受け入れる", () => {
    expect(paper("A4")).toBe("A4");
    expect(paper("Letter")).toBe("Letter");
    expect(() => paper("B5")).toThrow("用紙サイズ");
  });

  it("コードテーマの既定値を維持する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-config-"));
    const input = join(directory, "sample.md");
    await writeFile(input, "# Sample");
    expect((await resolvedConfig(input)).codeTheme).toBe("github-dark");
  });

  it("ページ番号の形式とフォントをフッターへ反映する", () => {
    const current = footerTemplate(undefined, true, "current", "UD新ゴ R");
    expect(current).toContain('<span class="pageNumber"></span>');
    expect(current).not.toContain("totalPages");
    expect(current).toContain("UD新ゴ R");

    const currentTotal = footerTemplate(undefined, true, "current-total");
    expect(currentTotal).toContain(
      '<span class="pageNumber"></span>/<span class="totalPages"></span>',
    );
  });

  it("PDFのMediaBoxを正確なA4寸法へ正規化する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-page-size-"));
    const output = join(directory, "a4.pdf");
    const source = await PDFDocument.create();
    source.addPage([594.96, 841.92]);
    await writeFile(output, await source.save());

    await normalizePdfPageSize(output, "A4");

    const normalized = await PDFDocument.load(await readFile(output));
    const size = normalized.getPage(0).getSize();
    expect(size.width).toBeCloseTo((210 / 25.4) * 72, 10);
    expect(size.height).toBeCloseTo((297 / 25.4) * 72, 10);
  });

  it("GitHubテーマの横長な表を最終列までPDFへ出力する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-wide-table-"));
    const input = join(directory, "wide-table.md");
    const output = join(directory, "wide-table.pdf");
    const headers = Array.from(
      { length: 8 },
      (_, index) => `Column-${index + 1}`,
    );
    const source = [
      "# Wide table",
      "",
      `| ${headers.join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
      `| ${headers.map((_, index) => `value-${index + 1}-abcdefghijklmnop`).join(" | ")} |`,
    ].join("\n");
    await writeFile(input, source);

    await convertMarkdown(input, {
      output,
      theme: "github",
      margin: "18mm",
    });

    const loadingTask = getDocument({
      data: new Uint8Array(await readFile(output)),
    });
    try {
      const pdf = await loadingTask.promise;
      const renderedText: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const text = await page.getTextContent();
        renderedText.push(
          ...text.items.map((item) => ("str" in item ? item.str : "")),
        );
      }

      expect(renderedText.join("")).toContain("Column-8");
      expect(renderedText.join("")).toContain("value-8-abcdefghijklmnop");
    } finally {
      await loadingTask.destroy();
    }
  }, 30_000);

  it.each(["relative", "absolute", "file-url", "data-url", "svg"])(
    "%s の画像をPDFに埋め込む",
    async (sourceType) => {
      const directory = await mkdtemp(join(tmpdir(), "inkframe-images-"));
      const imageDirectory = join(directory, "画像 assets");
      await mkdir(imageDirectory);
      const image = join(imageDirectory, "赤 #1.png");
      await writeFile(image, RED_PNG);
      await writeFile(
        join(directory, "image.svg"),
        `<svg xmlns="http://www.w3.org/2000/svg" width="37" height="23"><image href="data:image/png;base64,${RED_PNG.toString("base64")}" width="37" height="23"/></svg>`,
      );
      const sources: Record<string, string> = {
        relative: "画像%20assets/赤%20%231.png",
        svg: "image.svg",
        absolute: pathToFileURL(image).pathname,
        "file-url": pathToFileURL(image).href,
        "data-url": `data:image/png;base64,${RED_PNG.toString("base64")}`,
      };
      const input = join(directory, "images.md");
      const output = join(directory, "pdf", "images.pdf");
      await writeFile(input, `![図 1: 赤い画像](${sources[sourceType]})`);

      await convertMarkdown(input, { output, theme: "github" });

      const loadingTask = getDocument({
        data: new Uint8Array(await readFile(output)),
      });
      try {
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const operators = await page.getOperatorList();
        const imageIndex = operators.fnArray.indexOf(OPS.paintImageXObject);
        expect(imageIndex).toBeGreaterThanOrEqual(0);
        expect(operators.argsArray[imageIndex].slice(1)).toEqual([37, 23]);
        const text = await page.getTextContent();
        expect(
          text.items
            .map((item) => ("str" in item ? item.str : ""))
            .join("")
            .normalize("NFKC"),
        ).toContain("図 1: 赤い画像");
      } finally {
        await loadingTask.destroy();
      }
    },
    30_000,
  );

  it.each([false, true])(
    "外部画像はallowExternalResources=%sに従って読み込む",
    async (allowExternalResources) => {
      let requests = 0;
      const server = createServer((_request, response) => {
        requests += 1;
        response.writeHead(200, { "Content-Type": "image/png" });
        response.end(RED_PNG);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Test server address is unavailable.");
        const directory = await mkdtemp(join(tmpdir(), "inkframe-external-image-"));
        const input = join(directory, "image.md");
        const output = join(directory, "image.pdf");
        await writeFile(
          input,
          `![External image](http://127.0.0.1:${address.port}/image.png)`,
        );

        await convertMarkdown(input, { output, allowExternalResources });

        expect(requests).toBe(allowExternalResources ? 1 : 0);
        const loadingTask = getDocument({
          data: new Uint8Array(await readFile(output)),
        });
        try {
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          const operators = await page.getOperatorList();
          const hasTestImage = operators.fnArray.some((operation, index) =>
            operation === OPS.paintImageXObject &&
            operators.argsArray[index][1] === 37 &&
            operators.argsArray[index][2] === 23,
          );
          expect(hasTestImage).toBe(allowExternalResources);
        } finally {
          await loadingTask.destroy();
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
    30_000,
  );

  it("圧縮時に既存の固定sidecarファイルを変更しない", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-compress-sidecar-"));
    const input = join(directory, "source.md");
    const output = join(directory, "output.pdf");
    const oldSidecar = `${output}.optimized.pdf`;
    const source = "# Protected source";
    const sentinel = "existing sidecar must survive";
    await writeFile(input, source);
    await writeFile(oldSidecar, sentinel);

    await convertMarkdown(input, { output, compress: true });

    expect(await readFile(input, "utf8")).toBe(source);
    expect(await readFile(oldSidecar, "utf8")).toBe(sentinel);
    expect((await readFile(output)).subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it.skipIf(process.platform === "win32")(
    "安全確認後に置かれた入力へのsymlinkを完成時に置き換える",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "mdpdf-atomic-output-"));
      const input = join(directory, "source.md");
      const output = join(directory, "output.pdf");
      const source = "# Atomic output";
      await writeFile(input, source);

      const conversion = convertMarkdown(input, { output });
      let temporaryOutputReady = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const entries = await readdir(directory);
        if (entries.some((entry) => entry.startsWith(".inkframe-output-"))) {
          temporaryOutputReady = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (!temporaryOutputReady) {
        await conversion;
        throw new Error("Atomic output directory was not observed.");
      }
      await symlink(input, output);
      await conversion;

      expect(await readFile(input, "utf8")).toBe(source);
      expect((await lstat(output)).isSymbolicLink()).toBe(false);
      expect((await readFile(output)).subarray(0, 5).toString()).toBe("%PDF-");
    },
    30_000,
  );

  it("変換失敗時に既存出力を保ち、一時出力を削除する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mdpdf-atomic-failure-"));
    const input = join(directory, "source.md");
    const output = join(directory, "output.pdf");
    const sentinel = "existing output must survive";
    await writeFile(input, "# Invalid margin conversion");
    await writeFile(output, sentinel);

    await expect(
      convertMarkdown(input, { output, margin: "1mm 2mm 3mm 4mm 5mm" }),
    ).rejects.toThrow("余白");

    expect(await readFile(output, "utf8")).toBe(sentinel);
    expect(
      (await readdir(directory)).some((entry) =>
        entry.startsWith(".inkframe-output-"),
      ),
    ).toBe(false);
  }, 30_000);
});
