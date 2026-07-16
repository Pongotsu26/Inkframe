import { describe, expect, it } from "vitest";
import {
  pageDimensions,
  pageDimensionsPoints,
  pageSizeCss,
} from "../src/page-size.js";

describe("page dimensions", () => {
  it("uses exact ISO dimensions for A4", () => {
    expect(pageDimensions("A4")).toEqual({
      width: "210mm",
      height: "297mm",
    });
    expect(pageSizeCss("A4")).toBe("210mm 297mm");
    expect(pageDimensionsPoints("A4")).toEqual({
      width: (210 / 25.4) * 72,
      height: (297 / 25.4) * 72,
    });
  });

  it("swaps dimensions in landscape orientation", () => {
    expect(pageDimensions("A4", "landscape")).toEqual({
      width: "297mm",
      height: "210mm",
    });
  });
});
