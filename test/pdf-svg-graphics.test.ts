import { beforeAll, describe, expect, it } from "vitest";

let OPS: typeof import("pdfjs-dist").OPS;
let adaptOperatorList: (operatorList: {
  fnArray: number[];
  argsArray: unknown[][];
}) => { fnArray: number[]; argsArray: unknown[][] };

beforeAll(async () => {
  Object.assign(globalThis, {
    DOMMatrix: class {},
    ImageData: class {},
    Path2D: class {},
  });
  ({ OPS } = await import("pdfjs-dist"));
  ({ adaptOperatorList } = await import(
    "../src/renderer/src/pdf-svg-graphics.js"
  ));
});

describe("PDF SVG operator adaptation", () => {
  it("Type3のpacked pathとtyped引数をSVG backend向けに展開する", () => {
    const packedPath = new Float32Array([
      0, 1, 2, 1, 3, 4, 2, 5, 6, 7, 8, 9, 10, 3, 11, 12, 13, 14, 4,
    ]);
    const adapted = adaptOperatorList({
      fnArray: [OPS.setTextMatrix, OPS.setFillRGBColor, OPS.constructPath],
      argsArray: [
        [new Float32Array([1, 0, 0, 1, 12, 34])],
        ["#0a141e"],
        [OPS.fill, [packedPath], new Float32Array([1, 2, 13, 14])],
      ],
    });

    expect(adapted.fnArray).toEqual([
      OPS.setTextMatrix,
      OPS.setFillRGBColor,
      OPS.constructPath,
      OPS.fill,
    ]);
    expect(adapted.argsArray[0]).toEqual([1, 0, 0, 1, 12, 34]);
    expect(adapted.argsArray[1]).toEqual([10, 20, 30]);
    expect(adapted.argsArray[2]).toEqual([
      [OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.curveTo, OPS.closePath],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31 / 3, 34 / 3, 35 / 3, 38 / 3, 13, 14],
    ]);
    expect(adapted.argsArray[3]).toEqual([]);
  });

  it("展開済みのpathとType3のd1境界命令をそのまま維持する", () => {
    const pathArguments = [[OPS.rectangle], [10, 20, 30, 40]];
    const bounds = [500, 0, 10, 20, 40, 60];
    const adapted = adaptOperatorList({
      fnArray: [OPS.setCharWidthAndBounds, OPS.constructPath],
      argsArray: [bounds, pathArguments],
    });

    expect(adapted.fnArray).toEqual([
      OPS.setCharWidthAndBounds,
      OPS.constructPath,
    ]);
    expect(adapted.argsArray).toEqual([bounds, pathArguments]);
  });

  it("CanvasがPath2Dへ置換したデータを空パスとして黙って描画しない", () => {
    expect(() =>
      adaptOperatorList({
        fnArray: [OPS.constructPath],
        argsArray: [[OPS.fill, [{}], new Float32Array([0, 0, 1, 1])]],
      }),
    ).toThrow("Render SVG before Canvas");
  });

  it("closePath後の二次曲線をsubpathの始点から変換する", () => {
    const adapted = adaptOperatorList({
      fnArray: [OPS.constructPath],
      argsArray: [
        [
          OPS.stroke,
          [new Float32Array([0, 9, 12, 4, 3, 3, 15, 18, 21])],
          new Float32Array([3, 12, 21, 18]),
        ],
      ],
    });

    expect(adapted.argsArray[0]).toEqual([
      [OPS.moveTo, OPS.closePath, OPS.curveTo],
      [9, 12, 5, 14, 8, 17, 18, 21],
    ]);
  });

  it("空パスをpaint命令へ変換し、rawFillPathを通常のfillとして描画する", () => {
    const adapted = adaptOperatorList({
      fnArray: [OPS.constructPath, OPS.constructPath],
      argsArray: [
        [OPS.endPath, [null], null],
        [
          OPS.rawFillPath,
          [new Float32Array([0, 0, 0, 1, 10, 0, 1, 10, 10, 4])],
          new Float32Array([0, 0, 10, 10]),
        ],
      ],
    });

    expect(adapted.fnArray).toEqual([
      OPS.constructPath,
      OPS.endPath,
      OPS.constructPath,
      OPS.fill,
    ]);
    expect(adapted.argsArray[0]).toEqual([[], []]);
    expect(adapted.argsArray[1]).toEqual([]);
    expect(adapted.argsArray[3]).toEqual([]);
  });
});
