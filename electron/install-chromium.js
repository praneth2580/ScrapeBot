const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  getBrowsersPath,
  getReadyMarkerPath,
  getPlaywrightPackageRoot,
} = require("./paths");

function chromiumLooksInstalled(browsersPath) {
  if (!fs.existsSync(browsersPath)) {
    return false;
  }

  try {
    const entries = fs.readdirSync(browsersPath);
    return entries.some(
      (entry) =>
        entry.startsWith("chromium-") || entry.startsWith("chromium_headless_shell-")
    );
  } catch {
    return false;
  }
}

function isChromiumReady() {
  const browsersPath = getBrowsersPath();
  const marker = getReadyMarkerPath();
  if (fs.existsSync(marker) && chromiumLooksInstalled(browsersPath)) {
    return true;
  }
  return chromiumLooksInstalled(browsersPath);
}

function markChromiumReady() {
  const marker = getReadyMarkerPath();
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(
    marker,
    JSON.stringify({ installedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

/**
 * Installs Playwright Chromium into PLAYWRIGHT_BROWSERS_PATH.
 * Uses Electron's Node via ELECTRON_RUN_AS_NODE when needed.
 */
function installChromium({ onLog } = {}) {
  const browsersPath = getBrowsersPath();
  fs.mkdirSync(browsersPath, { recursive: true });

  const playwrightRoot = getPlaywrightPackageRoot();
  const cliPath = path.join(playwrightRoot, "cli.js");

  if (!fs.existsSync(cliPath)) {
    return Promise.reject(
      new Error(
        `Playwright CLI not found at ${cliPath}. Reinstall the app or run npm install.`
      )
    );
  }

  const log = (line) => {
    if (typeof onLog === "function") {
      onLog(line);
    }
  };

  return new Promise((resolve, reject) => {
    log(`Installing Chromium into ${browsersPath}…`);

    const child = spawn(process.execPath, [cliPath, "install", "chromium"], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PLAYWRIGHT_BROWSERS_PATH: browsersPath,
        // Avoid prompting / interactive installs
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const handleChunk = (chunk) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) {
          log(line);
        }
      }
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && chromiumLooksInstalled(browsersPath)) {
        markChromiumReady();
        log("Chromium installed successfully.");
        resolve();
        return;
      }
      reject(
        new Error(
          `Playwright Chromium install failed (exit ${code ?? "unknown"}). Check your network and try again.`
        )
      );
    });
  });
}

module.exports = {
  isChromiumReady,
  installChromium,
  markChromiumReady,
};
