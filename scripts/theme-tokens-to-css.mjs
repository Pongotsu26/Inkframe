import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "design/inkframe-dark.tokens.json";
const outputPath =
  process.argv[3] ?? "src/renderer/src/styles/inkframe-theme.css";

function parseJsonc(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      )
        index += 1;
      index += 1;
      continue;
    }
    output += char;
  }
  return JSON.parse(output.replace(/,\s*([}\]])/g, "$1"));
}

const theme = parseJsonc(fs.readFileSync(inputPath, "utf8"));
const tokens = theme.tokens ?? {};
if (
  !Object.keys(tokens).length ||
  Object.entries(tokens).some(
    ([key, value]) => !key.startsWith("--") || typeof value !== "string",
  )
)
  throw new Error(`${inputPath} does not contain valid CSS tokens.`);

const css = `/* Generated from ${path.basename(inputPath)}. Do not edit directly. */\n:root {\n  color-scheme: ${theme.colorScheme ?? "dark"};\n${Object.entries(
  tokens,
)
  .map(([key, value]) => `  ${key}: ${value};`)
  .join("\n")}\n}\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, css, "utf8");
console.log(`Generated ${outputPath}`);
