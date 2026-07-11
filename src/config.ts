import { access, readFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import type { MdpdfConfig } from "./types.js";

export async function findConfig(inputPath: string, explicitPath?: string): Promise<MdpdfConfig> {
  if (explicitPath) return readConfig(resolve(explicitPath));

  let current = dirname(resolve(inputPath));
  const root = parse(current).root;
  while (true) {
    for (const name of ["mdpdf.config.json", ".mdpdfrc"]) {
      const candidate = join(current, name);
      try {
        await access(candidate);
        return readConfig(candidate);
      } catch {
        // 次の候補、または親ディレクトリを確認する。
      }
    }
    if (current === root) return {};
    current = dirname(current);
  }
}

async function readConfig(filePath: string): Promise<MdpdfConfig> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as MdpdfConfig;
  } catch (error) {
    throw new Error(`設定ファイルを読み込めません: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
}

export function mergeConfig(...configs: Array<MdpdfConfig | undefined>): MdpdfConfig {
  return configs.reduce<MdpdfConfig>((merged, config) => {
    if (!config) return merged;
    const defined = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as MdpdfConfig;
    const font = Object.fromEntries(Object.entries(config.font ?? {}).filter(([, value]) => value !== undefined));
    return { ...merged, ...defined, font: { ...merged.font, ...font } };
  }, {});
}
