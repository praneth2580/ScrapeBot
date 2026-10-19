# AI provider architecture

Scrapebot includes a provider-agnostic AI layer under `lib/ai/`. It is designed for WebPilot-style tasks (classify, intent, plan, interpret, recover) while remaining independent of any single vendor.

This repository is a **single Next.js app** (not a pnpm monorepo). The AI module lives at `lib/ai/` instead of `packages/ai/`.

## Architecture overview

```text
UI (app/settings) ──► API routes (app/api/ai/*) ──► AIService
                                                      │
                                      ┌───────────────┼───────────────┐
                                      ▼               ▼               ▼
                               Config store     Secret store      AIRouter
                               (JSON file)      (encrypted files)  │
                                                                   ▼
                                                            ProviderRegistry
                                                                   │
                    mock / ollama / openai-compatible / openai / anthropic /
                    google / custom / cli(cursor)
```

Key rules:

- Vendor SDK response objects never leave provider adapters.
- Model output is untrusted; structured results are Zod-validated.
- Secrets are never stored in `data/ai-settings.json` or returned to the browser.
- Cloud fallback is opt-in (`allowCloudFallback`).
- Playwright/browser execution stays outside the AI layer; plans are validated against an action allowlist.

## Configuration

Settings file (non-secret): `data/ai-settings.json`  
Secrets directory: `data/secrets/` (mode `0700`, files `0600`, AES-GCM at rest)

Override paths:

- `WEBPILOT_AI_SETTINGS_PATH`
- `WEBPILOT_SECRETS_DIR`
- `WEBPILOT_SECRET_KEY` (optional passphrase for local encryption)

### Routing modes

| Mode | Behavior |
|------|----------|
| `selected` | Always use `defaultProviderId` |
| `per-task` | Use `routing.taskProviders[task]` when set, else default; then fallbacks |
| `fallback` | Try default, then `fallbackProviderIds` |

When `allowCloudFallback` is `false`, fallback to `isCloud: true` providers is refused with `FALLBACK_REFUSED`.

## Supported adapters

| Kind | Status | Notes |
|------|--------|-------|
| `mock` | Implemented | No network; default for CI |
| `openai-compatible` | Implemented | LM Studio, vLLM, gateways |
| `ollama` | Implemented | Native `/api/chat` |
| `openai` | Implemented | Hosted OpenAI HTTP API |
| `anthropic` | Implemented | Messages API over HTTP |
| `google` | Implemented | Gemini `generateContent` REST |
| `custom` | Implemented | Alias of openai-compatible with private-endpoint defaults |
| `cli` | Partial | Cursor Agent CLI when `--print` (or configured flag) appears in `--help` |

Optional vendor SDKs are **not** required; adapters use `fetch` / `spawn`.

## Configure an API provider

1. Open [http://localhost:3001/settings](http://localhost:3001/settings).
2. Add provider → choose OpenAI / Anthropic / Google.
3. Set model id and paste API key (stored server-side only).
4. Click **Check** then **Test**.

Environment fallbacks for headless/CI:

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
# or GEMINI_API_KEY=
```

## Configure an OpenAI-compatible or local endpoint

1. Add provider → **OpenAI-compatible** or **Custom endpoint**.
2. Set base URL (e.g. `http://127.0.0.1:1234/v1` for LM Studio).
3. Enable **Allow private/local endpoints**.
4. Set model id as exposed by the server.

Private IPs and loopback are blocked unless `settings.allowPrivateEndpoints` is true (SSRF guard). Cloud metadata IPs are always blocked.

## Configure Ollama

1. Add provider → **Ollama**.
2. Base URL defaults to `http://127.0.0.1:11434`.
3. Model e.g. `llama3.2`.

Env: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.

## Configure CLI agents (Cursor)

The CLI adapter:

- Uses `spawn(executable, args)` only (never a shell string).
- Allowlists basenames: `agent`, `cursor-agent`, `cursor`.
- Probes `--help` for a non-interactive print mode (default flag `--print`).
- Marks structured JSON as **unsupported** unless you use an API/local provider.
- Does not automate interactive terminals or undocumented editor internals.

If the installed CLI does not advertise a print/non-interactive mode, availability check fails.

## Adding a new provider adapter

1. Implement `AIProvider` in `lib/ai/providers/<name>.ts`.
2. Register a factory in `lib/ai/bootstrap.ts` via `registerProviderFactory`.
3. Add the kind to `PROVIDER_KINDS` in `types.ts` and `ProviderKindSchema`.
4. Declare honest capability defaults in `capabilities.ts`.
5. Add unit tests with the mock provider pattern; never require live keys in default tests.
6. Document limitations.

## Hybrid execution

`lib/ai/hybrid/classify.ts` classifies native buttons/links/inputs with DOM rules first. AI is used only when the control is ambiguous.

Workflow plans (`schemas/tasks.ts`) are validated and scanned for prohibited actions (`evaluate`, `runShell`, etc.). Consequential actions require confirmation flags.

## Secret storage and privacy

- API keys: secret store only (not project crawl JSON, not `NEXT_PUBLIC_*`).
- Frontend list endpoints return `hasSecret: boolean`, never the key.
- Error sanitization strips Bearer tokens and common key patterns.
- Prompt content may include page text you send to a provider — prefer local providers for private sites; keep `allowCloudFallback` false unless you accept cloud transfer.

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ai/providers` | List redacted providers + routing |
| POST | `/api/ai/providers` | Create provider (optional `apiKey`) |
| PUT | `/api/ai/providers/[id]` | Update provider |
| DELETE | `/api/ai/providers/[id]` | Remove provider |
| POST | `/api/ai/providers/[id]/check` | Availability |
| POST | `/api/ai/providers/[id]/test` | Test prompt |
| GET/PUT | `/api/ai/routing` | Routing policy |
| POST | `/api/ai/tasks` | Run routed task |

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `AUTH_FAILED` | Bad/missing API key |
| `MODEL_NOT_FOUND` | Model id not installed / wrong name |
| `ENDPOINT_BLOCKED` | Private URL without allowPrivateEndpoints, or metadata IP |
| `FALLBACK_REFUSED` | Cloud fallback blocked by privacy setting |
| `SDK_MISSING` | Optional dependency not installed (rare; HTTP adapters avoid this) |
| `CAPABILITY_UNSUPPORTED` | CLI asked for structured JSON |
| `TIMEOUT` / `CANCELLED` | Increase timeout or check AbortSignal |

## Running tests

```bash
npm test
```

Tests use Node's built-in test runner and the mock provider. They do not call paid APIs.

Optional live integration (manual):

```bash
WEBPILOT_LIVE_AI_TEST=1 OPENAI_API_KEY=... npm test
```

(Live harness can be extended; default suite stays offline.)

## Unimplemented / needs verification

- OS keychain backend (file store is the documented local fallback).
- Streaming token UI for providers that support it.
- Full workflow planner + Playwright executor loop (schemas + allowlist exist; executor wiring is partial).
- Live Cursor Agent CLI verification depends on the binary installed on the machine and its documented flags.
- Chat thread generation still uses the legacy Ollama tool loop in `app/lib/chat-store.ts`; scrape analysis prefers the new AI router with Ollama fallback.
