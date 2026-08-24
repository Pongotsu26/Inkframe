import type { ConvertOptions, Inspection, PreviewHtml } from "./types";

export interface PreviewCacheEntry {
  key: string;
  preview: PreviewHtml;
  inspection: Inspection;
  autoFit: boolean;
}

export function previewRequestKey(
  path: string,
  content: string,
  options: unknown,
): string {
  return JSON.stringify([path, content, options]);
}

export function previewEntryMatches(
  entry: PreviewCacheEntry | undefined,
  key: string,
): boolean {
  return entry?.key === key;
}

export function shouldRequestPreview({
  entry,
  key,
  pendingKey,
  force = false,
}: {
  entry?: PreviewCacheEntry;
  key: string;
  pendingKey?: string;
  force?: boolean;
}): boolean {
  if (pendingKey === key) return false;
  return force || !previewEntryMatches(entry, key);
}

export function mergePreviewOptions(
  base: ConvertOptions,
  overrides: ConvertOptions = {},
): ConvertOptions {
  return {
    ...base,
    ...overrides,
    font: { ...base.font, ...overrides.font },
    fontFace: { ...base.fontFace, ...overrides.fontFace },
    fontSize: { ...base.fontSize, ...overrides.fontSize },
    pageNumberFont: {
      ...base.pageNumberFont,
      ...overrides.pageNumberFont,
    },
  };
}

const NESTED_OPTION_KEYS = [
  "font",
  "fontFace",
  "fontSize",
  "pageNumberFont",
] as const;

function optionValueMatches(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function previewOptionOverrides(
  base: ConvertOptions,
  next: ConvertOptions,
): ConvertOptions {
  const baseRecord = base as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const nestedKeys = new Set<string>(NESTED_OPTION_KEYS);
  const overrides: Record<string, unknown> = {};

  for (const key of new Set([
    ...Object.keys(baseRecord),
    ...Object.keys(nextRecord),
  ])) {
    if (nestedKeys.has(key)) continue;
    if (!optionValueMatches(baseRecord[key], nextRecord[key]))
      overrides[key] = nextRecord[key];
  }

  for (const key of NESTED_OPTION_KEYS) {
    const baseNested = (baseRecord[key] ?? {}) as Record<string, unknown>;
    const nextNested = (nextRecord[key] ?? {}) as Record<string, unknown>;
    const nestedOverrides: Record<string, unknown> = {};
    for (const nestedKey of new Set([
      ...Object.keys(baseNested),
      ...Object.keys(nextNested),
    ])) {
      if (!optionValueMatches(baseNested[nestedKey], nextNested[nestedKey]))
        nestedOverrides[nestedKey] = nextNested[nestedKey];
    }
    if (Object.keys(nestedOverrides).length) overrides[key] = nestedOverrides;
  }

  return overrides as ConvertOptions;
}
