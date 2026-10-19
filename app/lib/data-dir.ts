import path from "node:path";

/**
 * Resolves the writable local data directory.
 * In the desktop app Electron sets SCRAPEBOT_DATA_DIR to userData.
 */
export function resolveDataDir(): string {
  return (
    process.env.SCRAPEBOT_DATA_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), "data")
  );
}
