import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FontFace {
  name: string;
  style: string;
}

export interface FontFamily {
  family: string;
  faces: FontFace[];
}

export function parseMacFontFamilies(systemProfilerOutput: string): string[] {
  return [
    ...new Set(
      [...systemProfilerOutput.matchAll(/^\s+Family:\s*(.+)$/gm)].map((match) =>
        match[1].trim(),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "ja"));
}

export function parseMacFonts(systemProfilerOutput: string): FontFamily[] {
  const families = new Map<string, Map<string, FontFace>>();
  const facePattern =
    /^\s+Full Name:\s*(.+)\n\s+Family:\s*(.+)\n\s+Style:\s*(.+)$/gm;
  for (const match of systemProfilerOutput.matchAll(facePattern)) {
    const name = match[1].trim();
    const family = match[2].trim();
    const style = match[3].trim();
    const faces = families.get(family) ?? new Map<string, FontFace>();
    faces.set(name, { name, style });
    families.set(family, faces);
  }
  return [...families.entries()]
    .map(([family, faces]) => ({
      family,
      faces: [...faces.values()].sort((a, b) =>
        a.style.localeCompare(b.style, "ja"),
      ),
    }))
    .sort((a, b) => a.family.localeCompare(b.family, "ja"));
}

export async function listFonts(): Promise<FontFamily[]> {
  try {
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync(
        "system_profiler",
        ["SPFontsDataType"],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      return parseMacFonts(stdout);
    }
    const { stdout } = await execFileAsync("fc-list", [
      ":",
      "-f",
      "%{family}\t%{style}\t%{fullname}\n",
    ]);
    const families = new Map<string, Map<string, FontFace>>();
    for (const line of stdout.split("\n")) {
      const [familyValue, styleValue, nameValue] = line.split("\t");
      const family = familyValue?.split(",")[0]?.trim();
      const style = styleValue?.split(",")[0]?.trim();
      const name = nameValue?.split(",")[0]?.trim();
      if (!family || !name) continue;
      const faces = families.get(family) ?? new Map<string, FontFace>();
      faces.set(name, { name, style: style || "Regular" });
      families.set(family, faces);
    }
    return [...families.entries()]
      .map(([family, faces]) => ({ family, faces: [...faces.values()] }))
      .sort((a, b) => a.family.localeCompare(b.family));
  } catch (error) {
    throw new Error(
      `フォント一覧を取得できません。OS のフォント管理コマンドを確認してください: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
