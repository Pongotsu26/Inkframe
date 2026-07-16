import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  footerTemplate,
  markdownFilesIn,
  normalizePdfPageSize,
  paper,
  resolvedConfig,
} from "../src/renderer.js";

describe("Phase 2 renderer utilities", () => {
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
});
