import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const candidates = [
  process.env.DEVELOPER_DIR,
  "/Applications/Xcode.app/Contents/Developer",
  "/Applications/Xcode-beta.app/Contents/Developer",
].filter(Boolean);

const developerDir = candidates.find((candidate) =>
  existsSync(path.join(candidate, "usr/bin/actool")),
);
if (!developerDir) {
  console.error(
    "Xcode 26以降が見つかりません。Xcode.app または Xcode-beta.app を /Applications に配置してください。",
  );
  process.exit(1);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Using Xcode: ${developerDir}`);
run("pnpm", ["build"]);
const builderArgs = process.argv.slice(2).filter((arg) => arg !== "--");
run("pnpm", ["exec", "electron-builder", "--mac", ...builderArgs], {
  ...process.env,
  DEVELOPER_DIR: developerDir,
});
