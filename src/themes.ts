import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { MdpdfConfig } from "./types.js";

export interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  paper?: string;
  orientation?: "portrait" | "landscape";
  custom?: boolean;
  cssPath?: string;
  defaults?: MdpdfConfig;
}

async function themesIn(
  directory: string,
  custom = false,
): Promise<ThemeInfo[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const metadata = JSON.parse(
            await readFile(join(directory, entry.name, "theme.json"), "utf8"),
          ) as Partial<ThemeInfo>;
          return {
            id: custom ? join(directory, entry.name, "theme.css") : entry.name,
            name: metadata.name ?? entry.name,
            description: metadata.description ?? "",
            paper: metadata.paper,
            orientation: metadata.orientation,
            defaults: metadata.defaults,
            custom,
            cssPath: custom
              ? join(directory, entry.name, "theme.css")
              : undefined,
          };
        } catch {
          return {
            id: custom ? join(directory, entry.name, "theme.css") : entry.name,
            name: entry.name,
            description: "",
            custom,
            cssPath: custom
              ? join(directory, entry.name, "theme.css")
              : undefined,
          };
        }
      }),
  );
}

export async function listThemes(
  customDirectory?: string,
): Promise<ThemeInfo[]> {
  const bundled = await themesIn(join(dirname(import.meta.dirname), "themes"));
  const custom = customDirectory ? await themesIn(customDirectory, true) : [];
  const themes = [...bundled, ...custom];
  return themes.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function themeCssPath(theme: string): string {
  return isAbsolute(theme)
    ? theme
    : join(dirname(import.meta.dirname), "themes", theme, "theme.css");
}
