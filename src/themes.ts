import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ThemeInfo { id: string; name: string; description: string; }

export async function listThemes(): Promise<ThemeInfo[]> {
  const directory = join(dirname(import.meta.dirname), "themes");
  const entries = await readdir(directory, { withFileTypes: true });
  const themes = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      const metadata = JSON.parse(await readFile(join(directory, entry.name, "theme.json"), "utf8")) as Partial<ThemeInfo>;
      return { id: entry.name, name: metadata.name ?? entry.name, description: metadata.description ?? "" };
    } catch { return { id: entry.name, name: entry.name, description: "" }; }
  }));
  return themes.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}
