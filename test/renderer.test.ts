import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  footerTemplate,
  markdownFilesIn,
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
});
