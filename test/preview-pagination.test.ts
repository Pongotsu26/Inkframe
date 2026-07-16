import { describe, expect, it } from "vitest";
import {
  PREVIEW_PAGINATION_SCRIPT,
  PREVIEW_PAGINATION_STYLES,
} from "../src/renderer/src/preview-pagination.js";

describe("preview pagination styles", () => {
  it("keeps long tables paginatable in Paged.js", () => {
    expect(PREVIEW_PAGINATION_STYLES).toContain("display: table !important");
    expect(PREVIEW_PAGINATION_STYLES).toContain("overflow: visible !important");
    expect(PREVIEW_PAGINATION_STYLES).toContain("display: table-header-group");
    expect(PREVIEW_PAGINATION_STYLES).toContain("break-inside: avoid");
  });

  it("removes duplicated borders from split code blocks", () => {
    expect(PREVIEW_PAGINATION_STYLES).toContain("pre[data-split-to]");
    expect(PREVIEW_PAGINATION_STYLES).toContain("border-bottom: 0 !important");
    expect(PREVIEW_PAGINATION_STYLES).toContain("pre[data-split-from]");
    expect(PREVIEW_PAGINATION_STYLES).toContain("border-top: 0 !important");
  });

  it("repeats table headers before laying out continuation pages", () => {
    expect(PREVIEW_PAGINATION_SCRIPT).toContain("beforePageLayout");
    expect(PREVIEW_PAGINATION_SCRIPT).toContain(
      "dataset.inkframeRepeatedHeader",
    );
    expect(PREVIEW_PAGINATION_SCRIPT).toContain(
      "breakToken.node = repeatedRows[0]",
    );
    expect(() => new Function(PREVIEW_PAGINATION_SCRIPT)).not.toThrow();
  });
});
