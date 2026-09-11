/**
 * Writes that must not be lost quietly.
 *
 * The transcript and tool traces are fire-and-forget by design — losing one
 * line must never interrupt teaching a robot. But "fire and forget" had come
 * to mean "fire and never find out": a 401, a 429, a flaky uplink, and the
 * message stayed on screen while the row it was supposed to become never
 * existed. The audit (B04) asks for three things: a visible pending / saved /
 * failed state, bounded retries for transient failures, and no retry that
 * could ever change what the row means.
 *
 * Every item carries an idempotency key — the message id the api de-dupes on
 * — so a retry can only ever create the one row it was always going to. The
 * outbox is in-memory and lives as long as the provider: a reload drops it,
 * which is the honest limit of a browser without an account-scoped store, and
 * the unsaved count says so before the tab closes.
 */

import { AccountChangedError } from "./account";

export type OutboxItem = {
  /** The api's de-dup key: the message id. One key, one row, however many tries. */
  key: string;
  url: string;
  body: unknown;
  serialized: string;
  attempts: number;
  /** Set once the item is given up on, with the reason a person can act on. */
  failure?: string;
};

export type OutboxState = {
  pending: number;
  failed: number;
  /** Most recent failure, for the indicator. */
  lastFailure: string | null;
};

/** Just the call shape: tests hand in a stub, and Bun's `typeof fetch`
 *  carries extras (preconnect) a stub has no business implementing. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type OutboxOptions = {
  fetch?: Fetcher;
  /** Bounded on purpose: after this many transient failures the item is
   *  reported, not retried forever against an api that is down. */
  maxAttempts?: number;
  /** Delay before attempt n+1, in milliseconds. Exponential with a cap. */
  backoff?: (attempt: number) => number;
  onChange?: (state: OutboxState) => void;
  sleep?: (ms: number) => Promise<void>;
  attemptTimeoutMs?: number;
};

/** Statuses worth retrying: the request may succeed unchanged next time. */
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export class Outbox {
  private readonly items = new Map<string, OutboxItem>();
  private readonly inFlight = new Set<string>();
  private readonly fetcher: Fetcher;
  private readonly maxAttempts: number;
  private readonly backoff: (attempt: number) => number;
  private readonly onChange: (state: OutboxState) => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private lastFailure: string | null = null;
  private readonly lifetime = new AbortController();
  private readonly attemptTimeoutMs: number;

  constructor(options: OutboxOptions = {}) {
    this.fetcher = options.fetch ?? ((url, init) => fetch(url, init));
    this.maxAttempts = options.maxAttempts ?? 5;
    this.backoff = options.backoff ?? ((attempt) => Math.min(15_000, 1000 * 2 ** (attempt - 1)));
    this.onChange = options.onChange ?? (() => {});
    this.sleep = options.sleep ?? ((ms) => delay(ms, this.lifetime.signal));
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? 10000;
  }

  get disposed() { return this.lifetime.signal.aborted; }

  dispose() {
    this.lifetime.abort();
    this.items.clear();
  }

  get state(): OutboxState {
    let pending = 0;
    let failed = 0;
    for (const item of this.items.values()) {
      if (item.failure) failed++;
      else pending++;
    }
    return { pending, failed, lastFailure: this.lastFailure };
  }

  /**
   * File one write. Resolves true once the api has the row, false once it
   * has been given up on. Never rejects: callers are fire-and-forget.
   */
  async post(key: string, url: string, body: unknown): Promise<boolean> {
    if (this.disposed) return false;
    const existing = this.items.get(key);
    if (existing) return existing.failure ? false : this.drive(existing);
    let serialized: string;
    try { serialized = JSON.stringify(body); } catch { return false; }
    if (serialized === undefined) return false;
    const item: OutboxItem = { key, url, body: JSON.parse(serialized), serialized, attempts: 0 };
    this.items.set(key, item);
    this.notify();
    return this.drive(item);
  }

  /** Try every failed item again, from a clean attempt count. */
  async retryFailed(): Promise<void> {
    if (this.disposed) return;
    const failed = [...this.items.values()].filter((item) => item.failure);
    for (const item of failed) {
      item.failure = undefined;
      item.attempts = 0;
    }
    this.lastFailure = null;
    this.notify();
    await Promise.all(failed.map((item) => this.drive(item)));
  }

  private async drive(item: OutboxItem): Promise<boolean> {
    if (this.disposed || this.inFlight.has(item.key)) return false;
    this.inFlight.add(item.key);
    try {
      while (!this.disposed && item.attempts < this.maxAttempts) {
        item.attempts++;
        const verdict = await this.attempt(item);
        if (this.disposed) return false;
        if (verdict === "saved") {
          this.items.delete(item.key);
          this.notify();
          return true;
        }
        if (verdict === "rejected") break;
        if (item.attempts < this.maxAttempts) {
          await abortable(this.sleep(this.backoff(item.attempts)), this.lifetime.signal);
        }
      }
      if (!item.failure) item.failure = `gave up after ${item.attempts} attempts`;
      this.lastFailure = item.failure;
      this.notify();
      return false;
    } catch {
      return false;
    } finally {
      this.inFlight.delete(item.key);
    }
  }

  private async attempt(item: OutboxItem): Promise<"saved" | "transient" | "rejected"> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.attemptTimeoutMs);
    const signal = AbortSignal.any([controller.signal, this.lifetime.signal]);
    try {
      const response = await abortable(this.fetcher(item.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: item.serialized,
        signal,
      }), signal);
      if (response.ok) return "saved";
      if (TRANSIENT.has(response.status)) return "transient";
      // A 4xx the api will give again: the row is wrong, or the session is
      // gone. Retrying cannot fix either, and a retry that changed the row to
      // make it fit would be the "background retry changes ownership" hazard
      // the audit rules out.
      item.failure = response.status === 401 || response.status === 403
        ? "signed out — sign in again to save"
        : `rejected by the api (${response.status})`;
      return "rejected";
    } catch (error) {
      if (error instanceof AccountChangedError) {
        item.failure = error.message;
        return "rejected";
      }
      return "transient";
    } finally {
      clearTimeout(timer);
    }
  }

  private notify() {
    if (!this.disposed) this.onChange(this.state);
  }
}

/** Also bounds custom fetchers that ignore their signal. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener("abort", aborted, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancelled = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancelled);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancelled, { once: true });
  });
}
