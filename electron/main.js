const path = require("node:path");
const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");

// npm-installed Electron on Linux ships chrome-sandbox without root/SUID (mode 4755).
// Without this, the process aborts before any window opens.
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-setuid-sandbox");
}

const { ensureAppDirs, getBrowsersPath, getDataDir, isPackaged } = require("./paths");
const { isChromiumReady, installChromium } = require("./install-chromium");
const { startNextServer } = require("./start-server");

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let setupWindow = null;
/** @type {import('node:child_process').ChildProcess | null} */
let serverProcess = null;

const setupState = {
  phase: "idle",
  message: "Preparing…",
  logs: /** @type {string[]} */ ([]),
};

let bootPromise = null;

function sendSetupStatus(partial) {
  Object.assign(setupState, partial);
  if (partial.line) {
    setupState.logs.push(partial.line);
    if (setupState.logs.length > 400) {
      setupState.logs.splice(0, setupState.logs.length - 400);
    }
  }
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.webContents.send("setup:status", {
      phase: setupState.phase,
      message: setupState.message,
      line: partial.line,
    });
  }
}

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 560,
    height: 520,
    resizable: false,
    maximizable: false,
    title: "Scrapebot Setup",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setupWindow.once("ready-to-show", () => {
    setupWindow?.show();
  });

  setupWindow.on("closed", () => {
    setupWindow = null;
  });

  setupWindow.loadFile(path.join(__dirname, "setup.html"));
}

function getMainWindowBounds() {
  const { width: workWidth, height: workHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  // ~92% of the usable desktop so the chat UI has room without going fullscreen.
  const width = Math.max(1280, Math.round(workWidth * 0.92));
  const height = Math.max(840, Math.round(workHeight * 0.92));
  return {
    width: Math.min(width, workWidth),
    height: Math.min(height, workHeight),
  };
}

function createMainWindow(url) {
  const { width, height } = getMainWindowBounds();

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1100,
    minHeight: 720,
    title: "Scrapebot",
    show: false,
    backgroundColor: "#0f1419",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.center();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(url);
}

async function runChromiumInstall() {
  sendSetupStatus({
    phase: "installing",
    message: "Downloading Chromium…",
    line: "Starting Playwright Chromium install…",
  });

  await installChromium({
    onLog: (line) => {
      sendSetupStatus({ line });
    },
  });

  sendSetupStatus({
    phase: "done",
    message: "Chromium ready. Starting Scrapebot…",
    line: "Chromium ready.",
  });
}

async function ensureChromium() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = getBrowsersPath();

  if (isChromiumReady()) {
    sendSetupStatus({
      phase: "done",
      message: "Chromium already installed.",
      line: "Chromium already present.",
    });
    return;
  }

  if (!setupWindow) {
    createSetupWindow();
  }

  await runChromiumInstall();
}

async function launchAppServer() {
  process.env.SCRAPEBOT_DATA_DIR = getDataDir();
  process.env.PLAYWRIGHT_BROWSERS_PATH = getBrowsersPath();

  if (!isPackaged()) {
    // Dev mode: expect `next dev` (or similar) already listening.
    const port = Number(process.env.SCRAPEBOT_PORT) || 3001;
    // Prefer localhost so Next.js allowedDevOrigins / HMR match the page origin.
    const url = `http://localhost:${port}`;
    createMainWindow(url);
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.close();
    }
    return;
  }

  sendSetupStatus({
    phase: "starting",
    message: "Starting Scrapebot…",
    line: "Starting local server…",
  });

  const server = startNextServer();
  serverProcess = server.child;

  server.child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      dialog.showErrorBox(
        "Scrapebot",
        `The local server stopped unexpectedly (code ${code}${signal ? `, signal ${signal}` : ""}).`
      );
    }
  });

  await server.ready;
  createMainWindow(server.url);

  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.close();
  }
}

async function boot() {
  ensureAppDirs();
  process.env.SCRAPEBOT_DATA_DIR = getDataDir();
  process.env.PLAYWRIGHT_BROWSERS_PATH = getBrowsersPath();

  try {
    await ensureChromium();
    await launchAppServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendSetupStatus({
      phase: "error",
      message: "Setup failed",
      line: message,
    });

    if (!setupWindow) {
      createSetupWindow();
      // Give the window a moment to subscribe, then push state.
      setTimeout(() => {
        sendSetupStatus({
          phase: "error",
          message: "Setup failed",
          line: message,
        });
      }, 200);
    }

    if (!isPackaged() && !mainWindow) {
      // In dev, still try to open the UI so Chromium issues don't fully block chat.
      try {
        createMainWindow(`http://127.0.0.1:${Number(process.env.SCRAPEBOT_PORT) || 3001}`);
      } catch {
        // ignore
      }
    }
  }
}

function quitServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

ipcMain.handle("setup:get-state", () => ({
  phase: setupState.phase,
  message: setupState.message,
  logs: setupState.logs,
}));

ipcMain.handle("setup:retry", async () => {
  if (setupState.phase === "installing") {
    return { ok: false, reason: "already-running" };
  }

  try {
    await runChromiumInstall();
    await launchAppServer();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendSetupStatus({
      phase: "error",
      message: "Setup failed",
      line: message,
    });
    return { ok: false, reason: message };
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWindow || setupWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    bootPromise = boot();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootPromise = boot();
    }
  });

  app.on("before-quit", () => {
    quitServer();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
