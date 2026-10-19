import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const standaloneSrc = path.join(root, ".next", "standalone");
const outDir = path.join(root, ".next", "standalone-app");
const staticSrc = path.join(root, ".next", "static");
const publicSrc = path.join(root, "public");

/** Paths relative to the assembled app root that must not ship in the installer. */
const PRUNE_PATHS = [
  "data",
  "docs",
  "electron",
  "scripts",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "eslint.config.mjs",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
  "next.config.ts",
  "postcss.config.mjs",
  "package-lock.json",
  "node_modules/electron",
  "node_modules/electron-builder",
  "node_modules/concurrently",
  "node_modules/wait-on",
  "node_modules/@types",
  "node_modules/typescript",
  "node_modules/eslint",
  "node_modules/eslint-config-next",
  "node_modules/tsx",
  "node_modules/tailwindcss",
  "node_modules/@tailwindcss",
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function rm(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function assertExists(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${label} at ${p}. Run "npm run build" first.`);
  }
}

assertExists(standaloneSrc, "Next standalone output");
assertExists(staticSrc, ".next/static");

rm(outDir);
copyDir(standaloneSrc, outDir);

const staticDest = path.join(outDir, ".next", "static");
copyDir(staticSrc, staticDest);

if (fs.existsSync(publicSrc)) {
  copyDir(publicSrc, path.join(outDir, "public"));
}

// Ensure Playwright (and its CLI) are available next to the packaged server
// so Electron can run `playwright install chromium` after install.
const playwrightSrc = path.join(root, "node_modules", "playwright");
const playwrightCoreSrc = path.join(root, "node_modules", "playwright-core");
const playwrightDest = path.join(outDir, "node_modules", "playwright");
const playwrightCoreDest = path.join(outDir, "node_modules", "playwright-core");

if (!fs.existsSync(playwrightSrc)) {
  throw new Error("playwright is not installed in node_modules.");
}

copyDir(playwrightSrc, playwrightDest);
if (fs.existsSync(playwrightCoreSrc)) {
  copyDir(playwrightCoreSrc, playwrightCoreDest);
}

for (const rel of PRUNE_PATHS) {
  rm(path.join(outDir, rel));
}

// Never ship local DB / secrets even if something recreates data/
rm(path.join(outDir, "data"));

console.log(`Assembled desktop server bundle at ${outDir}`);
