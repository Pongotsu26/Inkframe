import { describe, expect, it } from "vitest";
import {
  mergePreviewOptions,
  previewEntryMatches,
  previewOptionOverrides,
  previewRequestKey,
  shouldRequestPreview,
} from "../src/renderer/src/preview-state";

describe("preview state", () => {
  it("同じ入力から作り直したオブジェクトでは更新キーを変えない", () => {
    const first = previewRequestKey("/document.md", "# Title", {
      theme: "github",
      font: { body: "BIZ UDPGothic" },
    });
    const second = previewRequestKey("/document.md", "# Title", {
      theme: "github",
      font: { body: "BIZ UDPGothic" },
    });

    expect(second).toBe(first);
  });

  it("Markdownまたは設定が変われば更新キーを変える", () => {
    const original = previewRequestKey("/document.md", "# Title", {
      theme: "github",
    });

    expect(
      previewRequestKey("/document.md", "# Updated", { theme: "github" }),
    ).not.toBe(original);
    expect(
      previewRequestKey("/document.md", "# Title", { theme: "paper" }),
    ).not.toBe(original);
  });

  it("プレビューと検査が同じ入力キーで完成した場合だけ再利用する", () => {
    const key = previewRequestKey("/document.md", "# Title", {
      theme: "github",
    });
    const entry = {
      key,
      preview: { pdfData: "pdf" },
      inspection: { outline: [], issues: [], assets: [] },
      autoFit: false,
    };

    expect(previewEntryMatches(entry, key)).toBe(true);
    expect(
      previewEntryMatches(
        entry,
        previewRequestKey("/document.md", "# Updated", {
          theme: "github",
        }),
      ),
    ).toBe(false);
    expect(previewEntryMatches(undefined, key)).toBe(false);
  });

  it("同じ完成済み・処理中レンダーを抑止し、手動更新だけ強制する", () => {
    const key = previewRequestKey("/document.md", "# Title", {
      theme: "github",
    });
    const entry = {
      key,
      preview: { pdfData: "pdf" },
      inspection: { outline: [], issues: [], assets: [] },
      autoFit: false,
    };

    expect(shouldRequestPreview({ entry, key })).toBe(false);
    expect(shouldRequestPreview({ key, pendingKey: key })).toBe(false);
    expect(shouldRequestPreview({ entry, key, force: true })).toBe(true);
    expect(
      shouldRequestPreview({ entry, key, pendingKey: key, force: true }),
    ).toBe(false);
    expect(
      shouldRequestPreview({
        entry,
        key: previewRequestKey("/document.md", "# Updated", {
          theme: "github",
        }),
      }),
    ).toBe(true);
  });

  it("文書設定をネストしたフォント設定ごとマージする", () => {
    expect(
      mergePreviewOptions(
        {
          theme: "github",
          toc: false,
          font: { body: "Body", code: "Code" },
          fontSize: { body: 10.5, h1: 20 },
          pageNumberFont: { family: "Page", face: "Regular" },
        },
        {
          theme: "university",
          toc: true,
          font: { body: "Document Body" },
          fontSize: { h1: 24 },
          pageNumberFont: { face: "Bold" },
        },
      ),
    ).toEqual({
      theme: "university",
      toc: true,
      font: { body: "Document Body", code: "Code" },
      fontFace: {},
      fontSize: { body: 10.5, h1: 24 },
      pageNumberFont: { family: "Page", face: "Bold" },
    });
  });

  it("UIで変更した項目だけを次のfrontmatter解決結果へ重ねる", () => {
    const applicationDefaults = {
      theme: "github",
      toc: false,
      margin: "18mm",
      font: { body: "App Body", code: "App Code" },
    };
    const previousBase = mergePreviewOptions(applicationDefaults, {
      toc: true,
      margin: "12mm",
      font: { body: "Document Body" },
    });
    const overrides = previewOptionOverrides(previousBase, {
      ...previousBase,
      theme: "paper",
      font: { ...previousBase.font, code: "UI Code" },
    });
    const nextBase = mergePreviewOptions(applicationDefaults, {
      toc: false,
      margin: "20mm",
      font: { body: "Updated Body" },
    });

    expect(overrides).toEqual({
      theme: "paper",
      font: { code: "UI Code" },
    });
    expect(mergePreviewOptions(nextBase, overrides)).toMatchObject({
      theme: "paper",
      toc: false,
      margin: "20mm",
      font: { body: "Updated Body", code: "UI Code" },
    });
  });
});
