/**
 * The owner's own OpenAI key, as the APP knows it: the last four characters.
 * That is all the app ever knows. (OpenAI only, for now.)
 *
 * The key itself is typed once, sent to the api over the owner's session, and
 * kept there encrypted; teaching goes through the api, which uses it. It is not
 * in localStorage, not in memory after the save returns, and no request the
 * browser can make will bring it back. (The first version kept it in the tab
 * and called the provider directly — see src/byok.ts in the api for why not.)
 */
import { useEffect, useSyncExternalStore } from "react";

export type ModelKey = { provider: "openai"; last4: string; addedAt: number };

/** Where the first version left keys. Removed on sight: a secret nobody is
 *  using any more should not sit readable in a browser. */
const LEGACY_STORAGE = "botcortex.byo-key";
export function forgetLegacyKey(): boolean {
  try {
    if (localStorage.getItem(LEGACY_STORAGE) === null) return false;
    localStorage.removeItem(LEGACY_STORAGE);
    return true;
  } catch {
    return false;
  }
}

type State = { key: ModelKey | null; loaded: boolean };
let state: State = { key: null, loaded: false };
const EMPTY = state;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (key: ModelKey | null) => {
  state = { key, loaded: true };
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export async function refreshModelKey(): Promise<void> {
  try {
    const res = await fetch("/api/model-key");
    if (res.ok) publish(((await res.json()) as { key: ModelKey | null }).key);
  } catch {
    /* offline: whatever was known stays known */
  }
}

/** One copy for the app: the composer, the picker and Settings all read it. */
export function useModelKey(): State {
  const current = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    if (state.loaded || loading) return;
    loading = refreshModelKey().finally(() => { loading = null; });
  }, []);
  return current;
}

export type SaveResult = { ok: true; key: ModelKey; verified: boolean } | { ok: false; error: string };

export async function saveModelKey(key: string): Promise<SaveResult> {
  try {
    const res = await fetch("/api/model-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const body = (await res.json().catch(() => ({}))) as { key?: ModelKey; verified?: boolean; error?: string };
    if (!res.ok || !body.key) return { ok: false, error: body.error ?? "Could not save the key." };
    publish(body.key);
    return { ok: true, key: body.key, verified: body.verified !== false };
  } catch {
    return { ok: false, error: "Could not reach BotCortex. Try again." };
  }
}

export async function removeModelKey(): Promise<boolean> {
  try {
    const res = await fetch("/api/model-key", { method: "DELETE" });
    if (!res.ok) return false;
    publish(null);
    return true;
  } catch {
    return false;
  }
}

/** For sign-out: the next person on this browser is someone else. */
export function forgetModelKey() {
  state = EMPTY;
  for (const listener of listeners) listener();
}
