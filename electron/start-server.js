const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  getBrowsersPath,
  getDataDir,
  getStandaloneRoot,
} = require("./paths");

const DEFAULT_PORT = 3210;

function pickPort() {
  const fromEnv = Number(process.env.SCRAPEBOT_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return DEFAULT_PORT;
}

function waitForServer(port, { timeoutMs = 60_000 } = {}) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { hostname: "127.0.0.1", port, path: "/", timeout: 2000 },
        (res) => {
          res.resume();
          resolve();
        }
      );

      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for Scrapebot server on port ${port}.`));
          return;
        }
        setTimeout(attempt, 250);
      });

      req.on("timeout", () => {
        req.destroy();
      });
    };

    attempt();
  });
}

function findSystemNode() {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const output = execFileSync(cmd, ["node"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (output && fs.existsSync(output)) {
      return output;
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveNodeRunner() {
  // Prefer a real Node binary so native modules (better-sqlite3) match the
  // ABI from `npm install`. Fall back to Electron-as-Node when needed.
  const systemNode = findSystemNode();
  if (systemNode) {
    return { command: systemNode, electronAsNode: false };
  }
  return { command: process.execPath, electronAsNode: true };
}

function startNextServer() {
  const port = pickPort();
  const standaloneRoot = getStandaloneRoot();
  const serverPath = path.join(standaloneRoot, "server.js");

  if (!fs.existsSync(serverPath)) {
    throw new Error(
      `Packaged server not found at ${serverPath}. Run "npm run electron:pack" first, or use "npm run electron:dev".`
    );
  }

  const { command, electronAsNode } = resolveNodeRunner();
  const dataDir = getDataDir();
  const browsersPath = getBrowsersPath();

  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    SCRAPEBOT_DATA_DIR: dataDir,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  };

  if (electronAsNode) {
    env.ELECTRON_RUN_AS_NODE = "1";
  }

  const child = spawn(command, [serverPath], {
    cwd: standaloneRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[scrapebot-server] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[scrapebot-server] ${chunk}`);
  });

  return {
    port,
    child,
    url: `http://127.0.0.1:${port}`,
    ready: waitForServer(port),
  };
}

module.exports = {
  startNextServer,
  waitForServer,
  pickPort,
  DEFAULT_PORT,
};
