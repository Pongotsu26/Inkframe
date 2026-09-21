import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    include: [
      "test/markdown-inspection.test.ts",
      "test/pdf-svg-*.test.ts",
      "test/preview-*.test.ts",
    ],
  },
});
