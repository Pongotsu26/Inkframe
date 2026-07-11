import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const pagedPolyfillId = "virtual:pagedjs-polyfill";
const resolvedPagedPolyfillId = `\0${pagedPolyfillId}`;

export default defineConfig({
  root: "src/renderer",
  plugins: [react(), {
    name: "pagedjs-polyfill-source",
    resolveId(id) { return id === pagedPolyfillId ? resolvedPagedPolyfillId : undefined; },
    load(id) {
      if (id !== resolvedPagedPolyfillId) return undefined;
      return `export default ${JSON.stringify(readFileSync(resolve("node_modules/pagedjs/dist/paged.polyfill.min.js"), "utf8"))};`;
    }
  }],
  base: "./",
  build: { outDir: "../../desktop/renderer-dist", emptyOutDir: true }
});
