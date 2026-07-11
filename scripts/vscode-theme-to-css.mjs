import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2] ?? "design/vscode-dark.generated.json";
const outputPath =
  process.argv[3] ?? "src/renderer/src/styles/vscode-theme.css";

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
const colors = theme.colors ?? {};
const get = (keys, fallback) => {
  for (const key of Array.isArray(keys) ? keys : [keys])
    if (colors[key]) return colors[key];
  return fallback;
};

const tokens = {
  "--bg-app": get("editor.background", "#1e1e1e"),
  "--bg-titlebar": get("titleBar.activeBackground", "#181818"),
  "--bg-sidebar": get("sideBar.background", "#181818"),
  "--bg-panel": get(["panel.background", "sideBar.background"], "#1f1f1f"),
  "--bg-panel-elevated": get("editorWidget.background", "#252526"),
  "--bg-input": get("input.background", "#313131"),
  "--bg-hover": get("list.hoverBackground", "#2a2d2e"),
  "--bg-selected": get("list.activeSelectionBackground", "#37373d"),
  "--bg-active": get("activityBarBadge.background", "#007acc"),
  "--bg-preview": get("editor.background", "#1e1e1e"),
  "--bg-paper": "#ffffff",
  "--paper-shadow": "0 12px 32px rgba(0, 0, 0, 0.45)",
  "--border-subtle": get(
    ["sideBar.border", "panel.border", "contrastBorder"],
    "#2b2b2b",
  ),
  "--border-strong": get("focusBorder", "#007fd4"),
  "--text-primary": get(["foreground", "editor.foreground"], "#cccccc"),
  "--text-secondary": get("descriptionForeground", "#a7a7a7"),
  "--text-muted": get("disabledForeground", "#858585"),
  "--text-disabled": get("disabledForeground", "#5f5f5f"),
  "--text-on-accent": get("button.foreground", "#ffffff"),
  "--accent": get(
    ["button.background", "focusBorder", "activityBarBadge.background"],
    "#007acc",
  ),
  "--accent-hover": get("button.hoverBackground", "#0e639c"),
  "--accent-soft": "rgba(57, 148, 188, 0.18)",
  "--focus-ring": get("focusBorder", "#007fd4"),
  "--danger": get("errorForeground", "#f14c4c"),
  "--warning": get("editorWarning.foreground", "#cca700"),
  "--success": get("testing.iconPassed", "#89d185"),
  "--info": get("editorInfo.foreground", "#3794ff"),
  "--button-bg": get("button.background", "#0e639c"),
  "--button-bg-hover": get("button.hoverBackground", "#1177bb"),
  "--button-secondary-bg": get("button.secondaryBackground", "#313131"),
  "--button-secondary-hover": get("button.secondaryHoverBackground", "#3c3c3c"),
  "--input-bg": get("input.background", "#313131"),
  "--input-border": get("input.border", "#3c3c3c"),
  "--input-border-focus": get("focusBorder", "#007fd4"),
  "--tab-active-border": get(["tab.activeBorder", "focusBorder"], "#007acc"),
  "--scrollbar-thumb": get(
    "scrollbarSlider.background",
    "rgba(121, 121, 121, 0.4)",
  ),
  "--scrollbar-thumb-hover": get(
    "scrollbarSlider.hoverBackground",
    "rgba(100, 100, 100, 0.7)",
  ),
};

const css = `/* Generated from ${path.basename(inputPath)}. Do not edit directly. */\n:root {\n  color-scheme: dark;\n${Object.entries(
  tokens,
)
  .map(([key, value]) => `  ${key}: ${value};`)
  .join("\n")}\n}\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, css, "utf8");
console.log(`Generated ${outputPath}`);
