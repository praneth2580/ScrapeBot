"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ProviderKind =
  | "mock"
  | "openai-compatible"
  | "ollama"
  | "openai"
  | "anthropic"
  | "google"
  | "custom"
  | "cli";

type RedactedProvider = {
  id: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  model?: string;
  baseUrl?: string;
  secretRef?: string;
  settings?: Record<string, unknown>;
  hasSecret: boolean;
};

type RoutingConfig = {
  mode: "selected" | "per-task" | "fallback";
  taskProviders?: Partial<
    Record<"classify" | "intent" | "plan" | "interpret" | "recover", string>
  >;
  fallbackProviderIds: string[];
  allowCloudFallback: boolean;
};

type SettingsPayload = {
  settings: {
    schemaVersion: number;
    defaultProviderId: string;
    routing: RoutingConfig;
    maxRepairAttempts: number;
    defaultTimeoutMs: number;
  };
  providers: RedactedProvider[];
  kinds: ProviderKind[];
};

const TASKS = ["classify", "intent", "plan", "interpret", "recover"] as const;

const KIND_LABELS: Record<ProviderKind, string> = {
  mock: "Mock (local)",
  "openai-compatible": "OpenAI-compatible",
  ollama: "Ollama",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  google: "Google Gemini",
  custom: "Custom endpoint",
  cli: "CLI agent",
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json();
  if (!response.ok) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

const emptyDraft = {
  id: "",
  name: "",
  kind: "mock" as ProviderKind,
  enabled: true,
  model: "",
  baseUrl: "",
  apiKey: "",
  allowPrivateEndpoints: true,
  executable: "",
};

export default function AISettingsPanel() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const payload = await fetchJson<SettingsPayload>("/api/ai/providers");
    setData(payload);
  }, []);

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to load settings.")
    );
  }, [load]);

  const providers = data?.providers ?? [];
  const routing = data?.settings.routing;

  const defaultNeedsBaseUrl = useMemo(() => {
    return ["openai-compatible", "custom", "ollama"].includes(draft.kind);
  }, [draft.kind]);

  function startCreate() {
    setEditingId(null);
    setDraft({
      ...emptyDraft,
      id: `provider-${Date.now().toString(36)}`,
      name: "New provider",
      kind: "mock",
    });
    setTestResult(null);
    setError(null);
  }

  function startEdit(provider: RedactedProvider) {
    setEditingId(provider.id);
    setDraft({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      enabled: provider.enabled,
      model: provider.model || "",
      baseUrl: provider.baseUrl || "",
      apiKey: "",
      allowPrivateEndpoints: Boolean(
        provider.settings?.allowPrivateEndpoints ?? true
      ),
      executable:
        typeof provider.settings?.executable === "string"
          ? provider.settings.executable
          : "",
    });
    setTestResult(null);
    setError(null);
  }

  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const provider = {
        id: draft.id.trim(),
        name: draft.name.trim(),
        kind: draft.kind,
        enabled: draft.enabled,
        model: draft.model.trim() || undefined,
        baseUrl: draft.baseUrl.trim() || undefined,
        settings: {
          allowPrivateEndpoints: draft.allowPrivateEndpoints,
          ...(draft.kind === "cli" && draft.executable
            ? { executable: draft.executable.trim() }
            : {}),
        },
      };

      if (editingId) {
        await fetchJson(`/api/ai/providers/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            apiKey: draft.apiKey.trim() === "" ? undefined : draft.apiKey.trim(),
          }),
        });
      } else {
        await fetchJson("/api/ai/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            apiKey: draft.apiKey.trim() === "" ? null : draft.apiKey.trim(),
            setDefault: false,
          }),
        });
      }

      setStatus("Provider saved. API keys are stored server-side only.");
      setDraft(emptyDraft);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProvider(id: string) {
    if (!confirm(`Remove provider "${id}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson(`/api/ai/providers/${id}`, { method: "DELETE" });
      setStatus("Provider removed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setBusy(true);
    try {
      await fetchJson("/api/ai/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultProviderId: id }),
      });
      setStatus(`Default provider set to ${id}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set default.");
    } finally {
      setBusy(false);
    }
  }

  async function checkProvider(id: string) {
    setBusy(true);
    setTestResult(null);
    try {
      const result = await fetchJson<{
        available: boolean;
        message?: string;
      }>(`/api/ai/providers/${id}/check`, { method: "POST" });
      setTestResult(
        `${id}: ${result.available ? "available" : "unavailable"} — ${result.message || ""}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  async function testProvider(id: string) {
    setBusy(true);
    setTestResult(null);
    try {
      const result = await fetchJson<{
        text: string;
        providerId: string;
        model?: string;
        durationMs: number;
        data?: unknown;
      }>(`/api/ai/providers/${id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setTestResult(
        `Test via ${result.providerId}${result.model ? ` (${result.model})` : ""} in ${result.durationMs}ms:\n${result.text}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRouting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const mode = String(form.get("mode")) as RoutingConfig["mode"];
      const allowCloudFallback = form.get("allowCloudFallback") === "on";
      const fallbackRaw = String(form.get("fallbackProviderIds") || "");
      const fallbackProviderIds = fallbackRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const taskProviders: RoutingConfig["taskProviders"] = {};
      for (const task of TASKS) {
        const value = String(form.get(`task-${task}`) || "").trim();
        if (value) taskProviders[task] = value;
      }

      await fetchJson("/api/ai/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routing: {
            mode,
            allowCloudFallback,
            fallbackProviderIds,
            taskProviders,
          },
        }),
      });
      setStatus("Routing updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Routing save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-6">
        <p className="text-sm text-slate-500">Loading AI provider settings…</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">AI providers</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Configure hosted APIs, local endpoints, or CLI agents. Secrets never
              leave the server or appear in project JSON.
            </p>
          </div>
          <button
            type="button"
            onClick={startCreate}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-strong)]"
          >
            Add provider
          </button>
        </div>

        <ul className="mt-5 divide-y divide-slate-200 dark:divide-slate-700">
          {providers.map((provider) => {
            const isDefault =
              provider.id === data.settings.defaultProviderId;
            return (
              <li
                key={provider.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{provider.name}</p>
                    {isDefault ? (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                        default
                      </span>
                    ) : null}
                    {!provider.enabled ? (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600">
                        disabled
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                    {KIND_LABELS[provider.kind]} · id={provider.id}
                    {provider.model ? ` · ${provider.model}` : ""}
                    {provider.hasSecret ? " · secret configured" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(provider)}
                    className="rounded-full border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy || isDefault}
                    onClick={() => setDefault(provider.id)}
                    className="rounded-full border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Make default
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => checkProvider(provider.id)}
                    className="rounded-full border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm"
                  >
                    Check
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => testProvider(provider.id)}
                    className="rounded-full border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-sm"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    disabled={busy || providers.length <= 1}
                    onClick={() => removeProvider(provider.id)}
                    className="rounded-full border border-red-200 dark:border-red-900 px-3 py-1.5 text-sm text-red-700 dark:text-red-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {(editingId !== null || draft.id) && draft.id ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-5 sm:p-6">
          <h3 className="text-base font-semibold">
            {editingId ? "Edit provider" : "New provider"}
          </h3>
          <form onSubmit={saveProvider} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-300">ID</span>
              <input
                required
                disabled={Boolean(editingId)}
                value={draft.id}
                onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Display name</span>
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Adapter</span>
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    kind: e.target.value as ProviderKind,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
              >
                {(data.kinds as ProviderKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Model</span>
              <input
                value={draft.model}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                placeholder="e.g. gpt-4o-mini, llama3.2"
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
              />
            </label>
            {defaultNeedsBaseUrl || draft.kind === "openai" || draft.kind === "anthropic" || draft.kind === "google" ? (
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-300">
                  Base URL{defaultNeedsBaseUrl ? " (required)" : " (optional override)"}
                </span>
                <input
                  value={draft.baseUrl}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, baseUrl: e.target.value }))
                  }
                  placeholder={
                    draft.kind === "ollama"
                      ? "http://127.0.0.1:11434"
                      : "https://api.example.com/v1"
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                />
              </label>
            ) : null}
            {draft.kind !== "mock" && draft.kind !== "cli" && draft.kind !== "ollama" ? (
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-300">
                  API key{editingId ? " (leave blank to keep existing)" : ""}
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.apiKey}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, apiKey: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                />
              </label>
            ) : null}
            {draft.kind === "cli" ? (
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-300">
                  Executable (optional, allowlisted)
                </span>
                <input
                  value={draft.executable}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, executable: e.target.value }))
                  }
                  placeholder="agent or cursor-agent"
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, enabled: e.target.checked }))
                }
              />
              Enabled
            </label>
            {(draft.kind === "openai-compatible" ||
              draft.kind === "custom" ||
              draft.kind === "ollama") && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.allowPrivateEndpoints}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      allowPrivateEndpoints: e.target.checked,
                    }))
                  }
                />
                Allow private/local endpoints (required for Ollama / LM Studio)
              </label>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Save provider
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(emptyDraft);
                  setEditingId(null);
                }}
                className="rounded-full border border-slate-200 dark:border-slate-600 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Routing</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose how tasks select providers. Cloud fallback never runs unless you
          explicitly allow it.
        </p>
        <form onSubmit={saveRouting} className="mt-4 grid gap-4">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">Mode</span>
            <select
              name="mode"
              defaultValue={routing?.mode || "selected"}
              className="mt-1 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            >
              <option value="selected">selected — always use default</option>
              <option value="per-task">per-task — map tasks to providers</option>
              <option value="fallback">fallback — try default then fallbacks</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              Fallback provider IDs (comma-separated)
            </span>
            <input
              name="fallbackProviderIds"
              defaultValue={routing?.fallbackProviderIds.join(", ") || ""}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allowCloudFallback"
              defaultChecked={routing?.allowCloudFallback}
            />
            Allow cloud fallback (sends prompt content to remote providers)
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {TASKS.map((task) => (
              <label key={task} className="block text-sm">
                <span className="text-slate-600 dark:text-slate-300">
                  Task: {task}
                </span>
                <select
                  name={`task-${task}`}
                  defaultValue={routing?.taskProviders?.[task] || ""}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                >
                  <option value="">(default provider)</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-fit rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save routing
          </button>
        </form>
      </section>

      {status ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{status}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {testResult ? (
        <pre className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4 text-xs whitespace-pre-wrap">
          {testResult}
        </pre>
      ) : null}
    </div>
  );
}
