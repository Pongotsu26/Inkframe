import { describe, expect, it } from "vitest";
import { inspectMarkdown } from "../src/markdown-inspection.js";

describe("inspectMarkdown", () => {
  it("複数の見出し記号の後に空白があれば警告しない", () => {
    const inspection = inspectMarkdown("# H1\n## H2\n###### H6");
    expect(inspection.issues).toEqual([]);
    expect(inspection.outline.map((item) => item.level)).toEqual([1, 2, 6]);
  });

  it("見出し記号の後に空白がない場合だけ警告する", () => {
    const inspection = inspectMarkdown("##見出し");
    expect(inspection.issues).toContainEqual(
      expect.objectContaining({ severity: "warning", line: 1 }),
    );
  });

  it("空の見出しは空白不足として扱わない", () => {
    const inspection = inspectMarkdown("###");
    expect(
      inspection.issues.some((issue) => issue.severity === "warning"),
    ).toBe(false);
  });
});
