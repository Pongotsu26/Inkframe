import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseMacFontFamilies(systemProfilerOutput: string): string[] {
  return [
    ...new Set(
      [...systemProfilerOutput.matchAll(/^\s+Family:\s*(.+)$/gm)].map((match) =>
        match[1].trim(),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "ja"));
}

export async function listFonts(): Promise<string[]> {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync(
        "system_profiler",
        ["SPFontsDataType"],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      return parseMacFontFamilies(stdout);
    }
    const { stdout } = await execFileAsync("fc-list", [":", "family"]);
    return [
      ...new Set(
        stdout
          .split("\n")
          .flatMap((line) => line.split(","))
          .map((font) => font.trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    throw new Error(
      `フォント一覧を取得できません。OS のフォント管理コマンドを確認してください: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
