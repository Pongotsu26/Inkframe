import type { Paper } from "./types.js";

const PAPER_DIMENSIONS: Record<Paper, readonly [string, string]> = {
  A4: ["210mm", "297mm"],
  A5: ["148mm", "210mm"],
  Letter: ["8.5in", "11in"],
};

const PAPER_DIMENSIONS_POINTS: Record<Paper, readonly [number, number]> = {
  A4: [(210 / 25.4) * 72, (297 / 25.4) * 72],
  A5: [(148 / 25.4) * 72, (210 / 25.4) * 72],
  Letter: [8.5 * 72, 11 * 72],
};

export function pageDimensions(
  paper: Paper,
  orientation: "portrait" | "landscape" = "portrait",
): { width: string; height: string } {
  const [portraitWidth, portraitHeight] = PAPER_DIMENSIONS[paper];
  return orientation === "landscape"
    ? { width: portraitHeight, height: portraitWidth }
    : { width: portraitWidth, height: portraitHeight };
}

export function pageSizeCss(
  paper: Paper | string,
  orientation: "portrait" | "landscape" = "portrait",
): string {
  const supportedPaper = paper in PAPER_DIMENSIONS ? (paper as Paper) : "A4";
  const { width, height } = pageDimensions(supportedPaper, orientation);
  return `${width} ${height}`;
}

export function pageDimensionsPoints(
  paper: Paper,
  orientation: "portrait" | "landscape" = "portrait",
): { width: number; height: number } {
  const [portraitWidth, portraitHeight] = PAPER_DIMENSIONS_POINTS[paper];
  return orientation === "landscape"
    ? { width: portraitHeight, height: portraitWidth }
    : { width: portraitWidth, height: portraitHeight };
}
