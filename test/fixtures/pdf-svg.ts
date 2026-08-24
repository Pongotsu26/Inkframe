import { getDocument, GlobalWorkerOptions, OPS } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { SVGGraphics } from "../../src/renderer/src/pdf-svg-graphics.js";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfSvgResult {
  clipCount: number;
  pathCount: number;
  type3FontCount: number;
  type3OperatorCount: number;
  visiblePathBounds: Array<{
    height: number;
    width: number;
    x: number;
    y: number;
  }>;
  visiblePathArea: number;
  visiblePathCount: number;
  visiblePathFillOpacities: number[];
  visiblePathsInsideViewport: boolean;
}

interface PdfObjectStore {
  get<T>(id: string, callback: (value: T) => void): unknown;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(window.atob(value), (character) =>
    character.charCodeAt(0),
  );
}

function resolvedObject<T>(objects: PdfObjectStore, id: string): Promise<T> {
  return new Promise((resolve) => objects.get(id, resolve));
}

window.renderPdfSvgFixture = async (pdfData: string): Promise<PdfSvgResult> => {
  const loadingTask = getDocument({ data: decodeBase64(pdfData) });
  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const operatorList = await page.getOperatorList();
    const fontIds = operatorList.fnArray.flatMap((operation, index) =>
      operation === OPS.setFont ? [operatorList.argsArray[index][0]] : [],
    );
    const fonts = await Promise.all(
      [...new Set(fontIds)].map((id) =>
        resolvedObject<{
          isType3Font?: boolean;
          charProcOperatorList?: Record<string, { fnArray: number[] }>;
        }>(page.commonObjs as unknown as PdfObjectStore, id),
      ),
    );
    const type3Fonts = fonts.filter((font) => font.isType3Font);
    const type3OperatorCount = type3Fonts.reduce(
      (total, font) =>
        total +
        Object.values(font.charProcOperatorList ?? {}).reduce(
          (fontTotal, character) => fontTotal + character.fnArray.length,
          0,
        ),
      0,
    );
    const viewport = page.getViewport({ scale: 1 });
    const graphics = new SVGGraphics(page.commonObjs, page.objs, true);
    const svg = (await graphics.getSVG(
      operatorList,
      viewport,
    )) as SVGSVGElement;
    document.querySelector("#preview")?.replaceChildren(svg);
    const svgBounds = svg.getBoundingClientRect();
    const visiblePaths = [...svg.querySelectorAll("path")].flatMap((path) => {
      if (path.closest("defs") || getComputedStyle(path).fill === "none")
        return [];
      const bounds = path.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 ? [{ path, bounds }] : [];
    });
    return {
      clipCount: svg.querySelectorAll("clipPath").length,
      pathCount: svg.querySelectorAll("path").length,
      type3FontCount: type3Fonts.length,
      type3OperatorCount,
      visiblePathBounds: visiblePaths.map(({ bounds }) => ({
        height: bounds.height,
        width: bounds.width,
        x: bounds.left - svgBounds.left,
        y: bounds.top - svgBounds.top,
      })),
      visiblePathArea: visiblePaths.reduce(
        (total, { bounds }) => total + bounds.width * bounds.height,
        0,
      ),
      visiblePathCount: visiblePaths.length,
      visiblePathFillOpacities: visiblePaths.map(({ path }) =>
        Number.parseFloat(getComputedStyle(path).fillOpacity),
      ),
      visiblePathsInsideViewport: visiblePaths.every(
        ({ bounds }) =>
          bounds.left >= svgBounds.left &&
          bounds.top >= svgBounds.top &&
          bounds.right <= svgBounds.right &&
          bounds.bottom <= svgBounds.bottom,
      ),
    };
  } finally {
    await loadingTask.destroy();
  }
};

declare global {
  interface Window {
    renderPdfSvgFixture(pdfData: string): Promise<PdfSvgResult>;
  }
}
