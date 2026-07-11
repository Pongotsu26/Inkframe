import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PreviewPdf, PreviewResult } from "./types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function renderPdfPages(preview: PreviewPdf): Promise<PreviewResult> {
  const loadingTask = getDocument({ data: preview.data });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDFプレビュー用Canvasを作成できませんでした。");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pages.push(canvas.toDataURL("image/png"));
      page.cleanup();
    }
    return { pages, pageCount: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}
