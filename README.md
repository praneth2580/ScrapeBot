# Scrapebot

A local-first chat workspace built with Next.js 16, React 19, SQLite, and Ollama.

The app gives you a polished multi-thread chat UI backed by a local Ollama server, persists chats in SQLite, lets you switch models per message, and can pull new Ollama models directly from the interface.

## Features

- Local Ollama chat integration
- Per-message model selection
- Pull new Ollama models from the UI
- Persistent chat threads stored in SQLite
- Create, clear, and delete chat threads
- Compact chat composer with quick prompts
- Local API routes for chat, models, and thread management
- **Provider-agnostic AI layer** (`lib/ai/`) with mock, Ollama, OpenAI-compatible, OpenAI, Anthropic, Gemini, custom, and CLI adapters — see [docs/ai-providers.md](docs/ai-providers.md) and `/settings`

## Stack

- Next.js `16.2.3`
- React `19.2.4`
- TypeScript
- Tailwind CSS `v4`
- `better-sqlite3`
- Playwright (Chromium for scraping)
- Electron (optional desktop shell)
- Ollama local API

## Requirements

- Node.js 20+
- npm
- Ollama installed locally and running
- For scraping in the browser/dev workflow: Chromium via `npm run playwright:install`

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Install Playwright Chromium (web/dev only; the desktop app does this on first launch):

```bash
npm run playwright:install
```

3. Start Ollama in another terminal if it is not already running:

```bash
ollama serve
```

4. Make sure you have at least one model available locally:

```bash
ollama pull llama3.1
```

5. Start the app:

```bash
npm run dev
```

6. Open the app:

```text
http://localhost:3001
```

### Desktop app

Run the UI inside Electron (uses the Next dev server):

```bash
npm run electron:dev
```

Build installers (Chromium is **not** bundled — first launch downloads it into the user data folder):

```bash
npm run electron:dist
```

Artifacts land in `dist-electron/` (AppImage/deb on Linux, NSIS on Windows, DMG on macOS).

On first desktop launch Scrapebot:
1. Shows a setup window
2. Runs `playwright install chromium` into `userData/ms-playwright`
3. Starts the packaged Next server
4. Opens the app window

Data (SQLite, AI settings, secrets) is stored under Electron `userData/data` when running as a desktop app (`SCRAPEBOT_DATA_DIR`).

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run typecheck
npm run playwright:install
npm run electron:dev
npm run electron:pack
npm run electron:dist
```

Notes:
- `dev` runs on `0.0.0.0:3001`
- `build` may require network access for Google Fonts during production builds
- Desktop installers intentionally omit Chromium to stay smaller; an internet connection is required once on first launch

## Environment Variables

These are optional. The app works without them if Ollama is running with its default local settings.

```bash
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
OLLAMA_TIMEOUT_MS=300000
SCRAPEBOT_DATA_DIR=/path/to/data
PLAYWRIGHT_BROWSERS_PATH=/path/to/ms-playwright
SCRAPEBOT_PORT=3210
```

What they do:
- `OLLAMA_BASE_URL`: points the app to your Ollama server
- `OLLAMA_MODEL`: preferred default model
- `OLLAMA_TIMEOUT_MS`: request timeout in milliseconds for long generations
- `SCRAPEBOT_DATA_DIR`: writable directory for SQLite / AI settings / secrets (set automatically by Electron)
- `PLAYWRIGHT_BROWSERS_PATH`: Playwright browser cache (set automatically by Electron)
- `SCRAPEBOT_PORT`: packaged desktop server port (default `3210`; electron:dev uses `3001`)

If `OLLAMA_MODEL` is not installed locally, the app falls back to the first available installed model.

## How It Works

### Chat Flow

- The UI sends messages to `app/api/chat/threads/[threadId]/messages/route.ts`
- The server resolves an available local Ollama model
- Full thread history is sent to Ollama for each reply
- The user and assistant messages are stored in SQLite

### Persistence

- SQLite database path: `data/chat.sqlite` (or `$SCRAPEBOT_DATA_DIR/chat.sqlite` in the desktop app)
- Threads and messages are stored locally on disk
- UI copy/config is also read from SQLite

### Model Management

- The model selector is populated from `app/api/chat/models/route.ts`
- You can pull a new model from the UI through Ollama's local `/api/pull`
- After a successful pull, the selector refreshes automatically

## Project Structure

```text
app/
  api/chat/
    models/route.ts
    route.ts
    config/route.ts
    threads/
      route.ts
      [threadId]/route.ts
      [threadId]/clear/route.ts
      [threadId]/messages/route.ts
  _components/
    chat-shell.tsx
    chat/
  lib/
    chat-store.ts
    data-dir.ts
    ollama.ts
electron/
  main.js
  preload.js
  setup.html
  install-chromium.js
  start-server.js
scripts/
  assemble-standalone.mjs
data/
  chat.sqlite
```

## Main Files

- [app/lib/ollama.ts](app/lib/ollama.ts): local Ollama connector, model resolution, timeout handling
- [app/lib/chat-store.ts](app/lib/chat-store.ts): SQLite persistence and chat/thread operations
- [app/_components/chat-shell.tsx](app/_components/chat-shell.tsx): main client shell and API orchestration
- [app/_components/chat/chat-composer.tsx](app/_components/chat/chat-composer.tsx): composer, model selection, add-model modal

## Troubleshooting

### `model '<name>' not found`

Pull the model locally first:

```bash
ollama pull <name>
```

You can also add models from the app's `Add model` flow.

### `The operation was aborted due to timeout`

Increase the timeout:

```bash
OLLAMA_TIMEOUT_MS=600000
```

### No local models are installed

Install one:

```bash
ollama pull llama3.1
```

### Production build fails while fetching fonts

This project currently uses Google-hosted fonts through Next.js font loading. In restricted-network environments, `npm run build` may fail until font access is available or the font setup is changed.

## Development Notes

- Chat replies are currently non-streaming
- Full conversation history is sent on each message
- The app is designed for local development and local model usage

