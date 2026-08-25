import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

function pdfStream(source: string): string {
  return `<< /Length ${Buffer.byteLength(source)} >>\nstream\n${source}\nendstream`;
}

function type3FixturePdf({
  colored = false,
  parentAlpha = false,
}: {
  colored?: boolean;
  parentAlpha?: boolean;
} = {}): Buffer {
  const pageContent = `${parentAlpha ? "/GS1 gs " : ""}BT /F1 72 Tf 80 100 Td (A) Tj ET`;
  const characterContent = [
    colored ? "1000 0 d0" : "1000 0 0 0 1000 1000 d1",
    ...(colored ? ["1 0 0 rg"] : []),
    "0 0 m",
    "1000 0 l",
    "500 1000 l",
    "h",
    "f",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> /ExtGState << /GS1 7 0 R >> >> /Contents 4 0 R >>",
    pdfStream(pageContent),
    `<< /Type /Font /Subtype /Type3 /PaintType ${colored ? 1 : 2} /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /A 6 0 R >> /Encoding << /Type /Encoding /Differences [65 /A] >> /FirstChar 65 /LastChar 65 /Widths [1000] /Resources << >> >>`,
    pdfStream(characterContent),
    "<< /Type /ExtGState /ca 0.1 /CA 0.1 >>",
  ];
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  let byteLength = Buffer.byteLength(chunks[0]);
  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength);
    const chunk = `${index + 1} 0 obj\n${object}\nendobj\n`;
    chunks.push(chunk);
    byteLength += Buffer.byteLength(chunk);
  }
  const xrefOffset = byteLength;
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  return Buffer.from(chunks.join(""));
}

describe("PDF SVG Type3 integration", () => {
  let browser: Browser;
  let server: ViteDevServer;
  let fixtureUrl: string;

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      logLevel: "silent",
      root: process.cwd(),
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const serverUrl = server.resolvedUrls?.local[0];
    if (!serverUrl) throw new Error("Vite integration server did not start.");
    fixtureUrl = new URL("test/fixtures/pdf-svg.html", serverUrl).href;
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("d1境界を持つType3 glyphを実ブラウザのSVGへ描画する", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(fixtureUrl);
      const result = await page.evaluate(
        (pdfData) => window.renderPdfSvgFixture(pdfData),
        type3FixturePdf().toString("base64"),
      );

      expect(result.type3FontCount).toBe(1);
      expect(result.type3OperatorCount).toBeGreaterThan(0);
      expect(result.pathCount).toBeGreaterThan(0);
      expect(result.clipCount).toBeGreaterThan(0);
      expect(result.visiblePathCount).toBeGreaterThan(0);
      expect(result.visiblePathArea).toBeGreaterThan(100);
      expect(result.visiblePathsInsideViewport).toBe(true);
      expect(result.visiblePathBounds).toHaveLength(1);
      expect(result.visiblePathBounds[0].x).toBeCloseTo(80, 0);
      expect(result.visiblePathBounds[0].y).toBeCloseTo(128, 0);
      expect(result.visiblePathBounds[0].width).toBeCloseTo(72, 0);
      expect(result.visiblePathBounds[0].height).toBeCloseTo(72, 0);
    } finally {
      await page.close();
    }
  });

  it("d0 colored glyphへ親の透明度を継承しない", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(fixtureUrl);
      const result = await page.evaluate(
        (pdfData) => window.renderPdfSvgFixture(pdfData),
        type3FixturePdf({ colored: true, parentAlpha: true }).toString(
          "base64",
        ),
      );

      expect(result.type3FontCount).toBe(1);
      expect(result.visiblePathCount).toBeGreaterThan(0);
      expect(result.visiblePathFillOpacities).toEqual([1]);
    } finally {
      await page.close();
    }
  });
});
