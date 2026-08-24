import { lstat, readlink, realpath, stat } from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/i;

interface PathIdentity {
  absolutePath: string;
  canonicalPath: string;
  device?: number;
  inode?: number;
  kind?: "directory" | "file" | "other";
}

export interface OutputPlan {
  inputPath: string;
  outputPath: string;
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

async function canonicalizePath(
  filePath: string,
  followedLinks = new Set<string>(),
): Promise<string> {
  const absolutePath = resolve(filePath);
  const root = parse(absolutePath).root;
  const segments = relative(root, absolutePath).split(sep).filter(Boolean);
  let currentPath = root;
  for (const [index, segment] of segments.entries()) {
    const candidate = join(currentPath, segment);
    try {
      const details = await lstat(candidate);
      if (!details.isSymbolicLink()) {
        if (index < segments.length - 1 && !details.isDirectory()) {
          throw new Error(
            `出力先の親パスがディレクトリではありません: ${candidate}`,
          );
        }
        currentPath = candidate;
        continue;
      }
      try {
        const resolvedCandidate = await realpath(candidate);
        return canonicalizePath(
          join(resolvedCandidate, ...segments.slice(index + 1)),
          followedLinks,
        );
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
      }
      const linkKey = comparablePath(candidate);
      if (followedLinks.has(linkKey)) {
        throw new Error(`シンボリックリンクが循環しています: ${candidate}`);
      }
      followedLinks.add(linkKey);
      const target = resolve(dirname(candidate), await readlink(candidate));
      return canonicalizePath(
        join(target, ...segments.slice(index + 1)),
        followedLinks,
      );
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      return join(currentPath, ...segments.slice(index));
    }
  }
  return currentPath;
}

async function identifyPath(filePath: string): Promise<PathIdentity> {
  const absolutePath = resolve(filePath);
  const identity: PathIdentity = {
    absolutePath,
    canonicalPath: await canonicalizePath(absolutePath),
  };
  try {
    const details = await stat(absolutePath);
    if (details.ino !== 0) {
      identity.device = details.dev;
      identity.inode = details.ino;
    }
    identity.kind = details.isDirectory()
      ? "directory"
      : details.isFile()
        ? "file"
        : "other";
  } catch {
    // A not-yet-created output is identified by its canonical parent and name.
  }
  return identity;
}

function identityKeys(identity: PathIdentity): string[] {
  const keys = [`path:${comparablePath(identity.canonicalPath)}`];
  if (identity.device !== undefined && identity.inode !== undefined) {
    keys.push(`file:${identity.device}:${identity.inode}`);
  }
  return keys;
}

function comparablePath(filePath: string): string {
  return process.platform === "win32" || process.platform === "darwin"
    ? filePath.toLowerCase()
    : filePath;
}

function isDescendantPath(parentPath: string, childPath: string): boolean {
  const relativePath = relative(
    comparablePath(parentPath),
    comparablePath(childPath),
  );
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

/** Return a safe default PDF path without ever reusing an unknown input suffix. */
export function pdfOutputPathFor(inputPath: string): string {
  return MARKDOWN_EXTENSION.test(inputPath)
    ? inputPath.replace(MARKDOWN_EXTENSION, ".pdf")
    : `${inputPath}.pdf`;
}

/** Keep the source tree below the batch output directory. */
export function batchPdfOutputPath(
  inputPath: string,
  inputRoot: string,
  outputRoot: string,
): string {
  const absoluteInput = resolve(inputPath);
  const absoluteRoot = resolve(inputRoot);
  const relativeInput = relative(absoluteRoot, absoluteInput);
  if (
    !relativeInput ||
    relativeInput === ".." ||
    relativeInput.startsWith(`..${sep}`) ||
    isAbsolute(relativeInput)
  ) {
    throw new Error(
      `バッチ入力が探索ルートの外側です: ${absoluteInput} (root: ${absoluteRoot})`,
    );
  }
  return resolve(outputRoot, pdfOutputPathFor(relativeInput));
}

/** Reject an output that resolves to any protected input, including links. */
export async function assertOutputDoesNotOverwriteInputs(
  inputPaths: readonly string[],
  outputPath: string,
): Promise<void> {
  const inputs = await Promise.all(inputPaths.map(identifyPath));
  const inputByKey = new Map<string, PathIdentity>();
  for (const input of inputs) {
    for (const key of identityKeys(input)) {
      inputByKey.set(key, input);
    }
  }

  const output = await identifyPath(outputPath);
  const protectedInput = identityKeys(output)
    .map((key) => inputByKey.get(key))
    .find((input) => input !== undefined);
  if (!protectedInput) return;
  throw new Error(
    `出力先が入力ファイルと同じです。入力を保護するため処理を中止しました: ${output.absolutePath} (input: ${protectedInput.absolutePath})`,
  );
}

/** Validate every batch output before the first conversion starts. */
export async function assertOutputPlansAreSafe(
  plans: readonly OutputPlan[],
  outputRoot?: string,
): Promise<void> {
  const protectedInputs = await Promise.all(
    [...new Set(plans.map((plan) => plan.inputPath))].map(identifyPath),
  );
  const inputByKey = new Map<string, PathIdentity>();
  for (const input of protectedInputs) {
    for (const key of identityKeys(input)) {
      inputByKey.set(key, input);
    }
  }

  const outputOwnerByKey = new Map<string, OutputPlan>();
  const identifiedOutputs = await Promise.all(
    plans.map(async (plan) => ({
      plan,
      output: await identifyPath(plan.outputPath),
    })),
  );
  for (const { output } of identifiedOutputs) {
    if (output.kind === "directory") {
      throw new Error(
        `PDF出力先としてディレクトリは指定できません: ${output.absolutePath}`,
      );
    }
  }
  if (outputRoot) {
    const identifiedRoot = await identifyPath(outputRoot);
    for (const { output } of identifiedOutputs) {
      if (
        !isDescendantPath(identifiedRoot.canonicalPath, output.canonicalPath)
      ) {
        throw new Error(
          `出力先が出力ルートの外側へ解決されます: ${output.absolutePath} (root: ${identifiedRoot.absolutePath})`,
        );
      }
    }
  }

  for (
    let leftIndex = 0;
    leftIndex < identifiedOutputs.length;
    leftIndex += 1
  ) {
    const left = identifiedOutputs[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < identifiedOutputs.length;
      rightIndex += 1
    ) {
      const right = identifiedOutputs[rightIndex];
      if (
        isDescendantPath(
          left.output.canonicalPath,
          right.output.canonicalPath,
        ) ||
        isDescendantPath(right.output.canonicalPath, left.output.canonicalPath)
      ) {
        throw new Error(
          `一方の出力先が別の出力先の親ファイルになります: ${left.output.absolutePath}, ${right.output.absolutePath} (inputs: ${left.plan.inputPath}, ${right.plan.inputPath})`,
        );
      }
    }
  }

  for (const { plan, output } of identifiedOutputs) {
    for (const key of identityKeys(output)) {
      const protectedInput = inputByKey.get(key);
      if (protectedInput) {
        throw new Error(
          `出力先が入力ファイルと同じです。入力を保護するため処理を中止しました: ${output.absolutePath} (input: ${protectedInput.absolutePath})`,
        );
      }
      const previous = outputOwnerByKey.get(key);
      if (previous && previous !== plan) {
        throw new Error(
          `複数の入力が同じ出力先に割り当てられています: ${output.absolutePath} (inputs: ${previous.inputPath}, ${plan.inputPath})`,
        );
      }
      outputOwnerByKey.set(key, plan);
    }
  }
}
