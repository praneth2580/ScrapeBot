import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "playwright"],
  // Electron loads via localhost/127.0.0.1; LAN IP kept for phone/tablet testing.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.16"],
  turbopack: {
    // Parent lockfiles under $HOME can confuse workspace-root detection.
    // Pinning root alone breaks CSS @import "tailwindcss" in Next 16
    // (resolves from the parent folder), so also alias the package.
    root: projectRoot,
    resolveAlias: {
      tailwindcss: path.join(projectRoot, "node_modules/tailwindcss"),
    },
  },
  // File-tracing can over-include when data paths use process.cwd().
  // Keep the desktop bundle free of Electron tooling and local state.
  outputFileTracingExcludes: {
    "/*": [
      "./electron/**/*",
      "./data/**/*",
      "./docs/**/*",
      "./dist-electron/**/*",
      "./node_modules/electron/**/*",
      "./node_modules/electron-builder/**/*",
      "./node_modules/concurrently/**/*",
      "./node_modules/wait-on/**/*",
    ],
  },
};

export default nextConfig;
