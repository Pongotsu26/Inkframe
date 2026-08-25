import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readUserConfig,
  userConfigPath,
  writeUserConfig,
} from "../src/config.js";
import { resolvedConfig } from "../src/renderer.js";

describe("CLI user defaults", () => {
  let originalConfigHome: string | undefined;

  beforeEach(async () => {
    originalConfigHome = process.env.INKFRAME_CONFIG_HOME;
    process.env.INKFRAME_CONFIG_HOME = await mkdtemp(
      join(tmpdir(), "inkframe-user-config-"),
    );
  });

  afterEach(() => {
    if (originalConfigHome === undefined)
      delete process.env.INKFRAME_CONFIG_HOME;
    else process.env.INKFRAME_CONFIG_HOME = originalConfigHome;
  });

  it("ユーザー共通設定を専用ファイルへ保存して読み込む", async () => {
    await writeUserConfig({
      orientation: "landscape",
      pageNumberFormat: "current",
      fontSize: { body: 12, h1: 22 },
    });

    expect(await readUserConfig()).toEqual({
      orientation: "landscape",
      pageNumberFormat: "current",
      fontSize: { body: 12, h1: 22 },
    });
    expect(JSON.parse(await readFile(userConfigPath(), "utf8"))).toEqual(
      await readUserConfig(),
    );
  });

  it("Electron版と同じ組み込み初期値を使う", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-defaults-"));
    const input = join(directory, "sample.md");
    await writeFile(input, "# Sample");

    const config = await resolvedConfig(input);

    expect(config).toMatchObject({
      theme: "github",
      paper: "A4",
      orientation: "portrait",
      margin: "18mm",
      toc: false,
      pageNumber: true,
      pageNumberFormat: "current-total",
      cover: false,
      lineBreaks: false,
      fontSize: { body: 10.5 },
    });
  });

  it("ユーザー設定よりプロジェクト、frontmatter、CLI引数を優先する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkframe-precedence-"));
    const input = join(directory, "sample.md");
    await writeUserConfig({
      paper: "A5",
      orientation: "landscape",
      font: { body: "User Body" },
    });
    await writeFile(
      join(directory, "inkframe.config.json"),
      JSON.stringify({ paper: "Letter", font: { heading: "Project Heading" } }),
    );
    await writeFile(
      input,
      [
        "---",
        "paper: A4",
        "font:",
        "  code: Frontmatter Code",
        "---",
        "# Sample",
      ].join("\n"),
    );

    const config = await resolvedConfig(input, {
      orientation: "portrait",
      font: { body: "CLI Body" },
    });

    expect(config.paper).toBe("A4");
    expect(config.orientation).toBe("portrait");
    expect(config.font).toEqual({
      body: "CLI Body",
      heading: "Project Heading",
      code: "Frontmatter Code",
    });
  });
});
