import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import type { MdpdfConfig } from "./types.js";

export function userConfigPath(): string {
  const configuredDirectory = process.env.INKFRAME_CONFIG_HOME;
  if (configuredDirectory)
    return join(resolve(configuredDirectory), "config.json");

  if (process.platform === "win32" && process.env.APPDATA)
    return join(process.env.APPDATA, "Inkframe", "config.json");

  if (process.platform === "darwin")
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Inkframe",
      "config.json",
    );

  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "inkframe",
    "config.json",
  );
}

export async function readUserConfig(
  filePath = userConfigPath(),
): Promise<MdpdfConfig> {
  try {
    await access(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return {};
    throw error;
  }
  return readConfig(filePath);
}

export async function writeUserConfig(
  config: MdpdfConfig,
  filePath = userConfigPath(),
): Promise<void> {
  const serializable = { ...config };
  for (const key of [
    "font",
    "fontFace",
    "fontSize",
    "pageNumberFont",
  ] as const) {
    const value = serializable[key];
    if (value && Object.keys(value).length === 0) delete serializable[key];
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(serializable, null, 2)}\n`);
}

export async function findConfig(
  inputPath: string,
  explicitPath?: string,
): Promise<MdpdfConfig> {
  if (explicitPath) return readConfig(resolve(explicitPath));

  let current = dirname(resolve(inputPath));
  const root = parse(current).root;
  while (true) {
    for (const name of [
      "inkframe.config.json",
      ".inkframerc",
      "mdpdf.config.json",
      ".mdpdfrc",
    ]) {
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
    throw new Error(
      `設定ファイルを読み込めません: ${filePath} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

export function mergeConfig(
  ...configs: Array<MdpdfConfig | undefined>
): MdpdfConfig {
  return configs.reduce<MdpdfConfig>((merged, config) => {
    if (!config) return merged;
    const defined = Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined),
    ) as MdpdfConfig;
    const font = Object.fromEntries(
      Object.entries(config.font ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    );
    const fontSize = Object.fromEntries(
      Object.entries(config.fontSize ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    );
    const fontFace = Object.fromEntries(
      Object.entries(config.fontFace ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    );
    const pageNumberFont = Object.fromEntries(
      Object.entries(config.pageNumberFont ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    );
    return {
      ...merged,
      ...defined,
      font: { ...merged.font, ...font },
      fontFace: { ...merged.fontFace, ...fontFace },
      pageNumberFont: { ...merged.pageNumberFont, ...pageNumberFont },
      fontSize: { ...merged.fontSize, ...fontSize },
    };
  }, {});
}
