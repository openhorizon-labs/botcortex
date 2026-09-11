export const PING_INTERVAL_MS = 5000;
const SILENT_AFTER_MS = 10000;
const TELEMETRY_AFTER_MS = 3000;
const DEAD_AFTER_MS = 15000;

/** Transport responses and streaming telemetry are different health signals.
 * Only call hear() after decoding a valid protocol event. */
export class ConnectionHealth {
  private lastMessage: number;
  private lastState: number | null = null;

  constructor(now = Date.now()) { this.lastMessage = now; }

  hear(type: string, now = Date.now()) {
    this.lastMessage = now;
    if (type === "state") this.lastState = now;
  }

  check(now = Date.now()) {
    const quiet = now - this.lastMessage;
    return {
      stale: quiet > SILENT_AFTER_MS || (this.lastState !== null && now - this.lastState > TELEMETRY_AFTER_MS),
      dead: quiet > DEAD_AFTER_MS,
    };
  }
}
