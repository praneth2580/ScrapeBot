const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

function getUserDataRoot() {
  return app.getPath("userData");
}

function getDataDir() {
  return path.join(getUserDataRoot(), "data");
}

function getBrowsersPath() {
  return path.join(getUserDataRoot(), "ms-playwright");
}

function getReadyMarkerPath() {
  return path.join(getBrowsersPath(), ".scrapebot-chromium-ready");
}

function isPackaged() {
  return app.isPackaged;
}

function getStandaloneRoot() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, "app");
  }
  return path.join(__dirname, "..", ".next", "standalone-app");
}

function getPlaywrightPackageRoot() {
  if (isPackaged()) {
    return path.join(getStandaloneRoot(), "node_modules", "playwright");
  }
  return path.dirname(require.resolve("playwright/package.json"));
}

function ensureAppDirs() {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.mkdirSync(getBrowsersPath(), { recursive: true });
}

module.exports = {
  getUserDataRoot,
  getDataDir,
  getBrowsersPath,
  getReadyMarkerPath,
  isPackaged,
  getStandaloneRoot,
  getPlaywrightPackageRoot,
  ensureAppDirs,
};
