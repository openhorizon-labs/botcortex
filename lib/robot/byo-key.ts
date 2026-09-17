/**
 * Bring your own model key, for robots simulated in this browser.
 *
 * The business model has always said BotCortex never resells inference: an
 * owner may bring their own OpenAI or Anthropic key. A real robot does that in
 * its own environment. A robot simulated in a tab had no way to, so everyone
 * teaching in the browser was on our credit whether they wanted to be or not.
 *
 * The key lives in THIS browser's localStorage and goes from the tab straight
 * to the provider. It is never sent to BotCortex: the request below is made
 * with `credentials: "omit"` to a provider's own host, and nothing in the api
 * has a field it could arrive in. That is a real property and not a promise —
 * `byo-key.test.ts` holds it.
 *
 * What it costs the owner is what localStorage always costs: a script running
 * on this origin could read it. That is the same trust as every
 * key-in-the-browser tool, and it is said in the settings panel rather than
 * left for someone to work out.
 */

export type ByoProvider = "openai" | "anthropic";

export type ByoKey = { provider: ByoProvider; key: string; model: string };

const STORAGE_KEY = "botcortex.byo-key";

export const BYO_PROVIDERS: Record<ByoProvider, { label: string; endpoint: string; defaultModel: string; keyHint: string }> = {
  openai: {
    label: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-5.5",
    keyHint: "sk-…",
  },
  anthropic: {
    label: "Anthropic",
    // Anthropic's OpenAI-compatible endpoint: the agent loop speaks one wire
    // format, and a second one would be a second loop to keep honest.
    endpoint: "https://api.anthropic.com/v1/chat/completions",
    defaultModel: "claude-sonnet-5",
    keyHint: "sk-ant-…",
  },
};

export function loadByoKey(): ByoKey | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ByoKey>;
    if ((value.provider !== "openai" && value.provider !== "anthropic") || typeof value.key !== "string" || !value.key.trim()) {
      return null;
    }
    const model = typeof value.model === "string" && value.model.trim() ? value.model.trim() : BYO_PROVIDERS[value.provider].defaultModel;
    return { provider: value.provider, key: value.key.trim(), model };
  } catch {
    return null; // private window, blocked storage, or a corrupt entry
  }
}

export function saveByoKey(value: ByoKey): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: value.provider, key: value.key.trim(), model: value.model.trim() }));
  window.dispatchEvent(new Event(BYO_CHANGED));
}

export function clearByoKey(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
  window.dispatchEvent(new Event(BYO_CHANGED));
}

/** Fired on this window when the key is saved or removed, so the composer and
 *  the settings panel agree without a reload. */
export const BYO_CHANGED = "botcortex:byo-changed";

/** "sk-…abcd": enough to recognise which key is saved, never the key. */
export function maskKey(key: string): string {
  const tail = key.slice(-4);
  return key.length > 8 ? `${key.slice(0, 3)}…${tail}` : "…";
}

export type ByoRoute = {
  endpoint: string;
  model: string;
  provider: ByoProvider;
  fetcher: (url: string, init?: RequestInit) => Promise<Response>;
};

/** Where and how the agent loop should call the model with this key. */
export function byoRoute(value: ByoKey): ByoRoute {
  const { endpoint } = BYO_PROVIDERS[value.provider];
  const auth: Record<string, string> =
    value.provider === "anthropic"
      ? {
          "x-api-key": value.key,
          "anthropic-version": "2023-06-01",
          // Anthropic refuses browser calls without this opt-in. The risk it
          // names is the one the settings panel states: the key is in the tab.
          "anthropic-dangerous-direct-browser-access": "true",
        }
      : { Authorization: `Bearer ${value.key}` };
  return {
    endpoint,
    model: value.model,
    provider: value.provider,
    fetcher: (url, init = {}) => {
      // The key may only ever travel to the provider it belongs to.
      if (url !== endpoint) return Promise.reject(new Error("refusing to send a model key anywhere but its provider"));
      return fetch(url, {
        ...init,
        credentials: "omit",
        headers: { ...(init.headers as Record<string, string> | undefined), ...auth },
      });
    },
  };
}
