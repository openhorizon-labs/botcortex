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
 * — so a retry can only ever create the one row it was always going to.
 *
 * Two things the first version got wrong, both seen live. It gave up on a
 * transient failure after five tries (about thirty seconds) and then sat
 * showing "6 unsaved" until someone pressed retry — but an api that is
 * restarting comes back on its own, and the right response is to keep
 * trying quietly and say so. And it lived only in memory, so a reload
 * dropped the queue. Now a transient failure is retried for as long as the
 * outbox lives (backoff capped, woken early by `nudge` when the network or
 * the tab comes back), only a rejection the api would give again counts as
 * failed, and the queue is journalled per account so a reload picks up
 * where it left off.
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
  /** Pending items that have been refused transiently more than
   *  `maxAttempts` times in a row: the api is away, and the outbox is still
   *  trying. Zero while writes are merely in flight. */
  stalled: number;
};

/** Where the queue survives a reload. localStorage in the browser; a test
 *  hands in a map. Only the fields a retry needs are kept. */
export type OutboxJournal = {
  load(): string | null;
  save(serialized: string): void;
};

/** Just the call shape: tests hand in a stub, and Bun's `typeof fetch`
 *  carries extras (preconnect) a stub has no business implementing. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type OutboxOptions = {
  fetch?: Fetcher;
  /** After this many transient failures in a row an item is reported as
   *  stalled. It is still retried: the api being away is not a reason to
   *  lose the row, only a reason to say so. */
  maxAttempts?: number;
  /** Persist pending items here, and replay whatever is found at
   *  construction. Omit for an in-memory queue. */
  journal?: OutboxJournal;
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
  private readonly journal: OutboxJournal | null;
  /** Aborted by `nudge` so every sleeping retry wakes at once. */
  private wake = new AbortController();

  constructor(options: OutboxOptions = {}) {
    this.fetcher = options.fetch ?? ((url, init) => fetch(url, init));
    this.maxAttempts = options.maxAttempts ?? 5;
    this.backoff = options.backoff ?? ((attempt) => Math.min(30_000, 1000 * 2 ** (attempt - 1)));
    this.onChange = options.onChange ?? (() => {});
    this.sleep = options.sleep ?? ((ms) => delay(ms, this.lifetime.signal));
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? 10000;
    this.journal = options.journal ?? null;
  }

  /** Replay what a previous page load left behind. Called once, after
   *  construction, by the owner that knows the journal is this account's. */
  resume(): number {
    if (this.disposed || !this.journal) return 0;
    let parsed: unknown;
    try {
      const raw = this.journal.load();
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      return 0;
    }
    if (!Array.isArray(parsed)) return 0;
    let resumed = 0;
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { key, url, serialized } = entry as Partial<OutboxItem>;
      if (typeof key !== "string" || typeof url !== "string" || typeof serialized !== "string") continue;
      if (this.items.has(key)) continue;
      let body: unknown;
      try { body = JSON.parse(serialized); } catch { continue; }
      const item: OutboxItem = { key, url, body, serialized, attempts: 0 };
      this.items.set(key, item);
      resumed++;
      void this.drive(item);
    }
    if (resumed) this.notify();
    return resumed;
  }

  get disposed() { return this.lifetime.signal.aborted; }

  dispose() {
    this.lifetime.abort();
    this.wake.abort();
    this.items.clear();
  }

  get state(): OutboxState {
    let pending = 0;
    let failed = 0;
    let stalled = 0;
    for (const item of this.items.values()) {
      if (item.failure) failed++;
      else {
        pending++;
        if (item.attempts >= this.maxAttempts) stalled++;
      }
    }
    return { pending, failed, lastFailure: this.lastFailure, stalled };
  }

  /** Try everything that is waiting on a backoff right now — the network
   *  came back, the tab was brought forward, the owner pressed retry. */
  nudge(): void {
    if (this.disposed) return;
    const sleeping = this.wake;
    this.wake = new AbortController();
    sleeping.abort(new Wake("nudged"));
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

  /** Try every failed item again, from a clean attempt count, and wake
   *  every stalled one. */
  async retryFailed(): Promise<void> {
    if (this.disposed) return;
    const failed = [...this.items.values()].filter((item) => item.failure);
    for (const item of failed) {
      item.failure = undefined;
      item.attempts = 0;
    }
    this.lastFailure = null;
    this.notify();
    this.nudge();
    await Promise.all(failed.map((item) => this.drive(item)));
  }

  private async drive(item: OutboxItem): Promise<boolean> {
    if (this.disposed || this.inFlight.has(item.key)) return false;
    this.inFlight.add(item.key);
    try {
      while (!this.disposed) {
        item.attempts++;
        const verdict = await this.attempt(item);
        if (this.disposed) return false;
        if (verdict === "saved") {
          this.items.delete(item.key);
          if (item.attempts > 1) this.lastFailure = null;
          this.notify();
          return true;
        }
        if (verdict === "rejected") break;
        // Transient: wait and go again, for as long as the outbox lives.
        // Crossing maxAttempts changes what the owner is told (stalled),
        // not what happens next.
        if (item.attempts === this.maxAttempts) {
          this.lastFailure = "the api is not answering — still trying";
          this.notify();
        }
        const capped = Math.min(item.attempts, this.maxAttempts);
        await abortable(this.sleep(this.backoff(capped)), AbortSignal.any([this.lifetime.signal, this.wake.signal]));
        if (this.disposed) return false;
      }
      if (this.disposed) return false;
      this.lastFailure = item.failure ?? null;
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
      // Only a nudge resolves undefined, and a nudge never aborts an attempt.
      if (!response) return "transient";
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
    if (this.disposed) return;
    this.record();
    this.onChange(this.state);
  }

  /** Journal the pending items (never the failed ones: a rejection the api
   *  would give again is not worth replaying on the next load). */
  private record() {
    if (!this.journal) return;
    const pending = [...this.items.values()]
      .filter((item) => !item.failure)
      .map(({ key, url, serialized }) => ({ key, url, serialized }));
    try {
      this.journal.save(JSON.stringify(pending));
    } catch {
      // Storage full or blocked: the in-memory queue still runs.
    }
  }
}

/** A journal on localStorage under `key`; inert where storage is missing. */
export function localStorageJournal(key: string): OutboxJournal {
  return {
    load: () => {
      try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
    },
    save: (serialized) => {
      try {
        if (serialized === "[]") globalThis.localStorage?.removeItem(key);
        else globalThis.localStorage?.setItem(key, serialized);
      } catch { /* optional */ }
    },
  };
}

/** Also bounds custom fetchers that ignore their signal. Rejects on abort;
 *  the drive loop treats a woken backoff (nudge) as "go now" by checking
 *  `disposed` rather than the reason. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const aborted = () => (signal.reason instanceof Wake ? resolve(undefined) : reject(signal.reason));
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

/** The reason a nudge aborts with, so a woken sleep is not an error. */
class Wake extends Error {}

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
