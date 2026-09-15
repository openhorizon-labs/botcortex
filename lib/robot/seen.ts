/**
 * How long ago a paired robot last announced itself, in words.
 *
 * The runtime registers on boot and not since (no heartbeat yet), so
 * "last seen" is "last booted". Old enough and the entry is stale: a laptop
 * that served the runtime once, a rig that has been off for a week. The
 * sidebar says so beside the name instead of listing it like a live robot.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Older than this and a paired robot reads as stale in the list. */
export const STALE_AFTER_MS = HOUR;
/** Older than this and the app does not dial it on its own at load. */
export const AUTO_CONNECT_WITHIN_MS = 7 * DAY;

export function ageMs(lastSeenAt: string | null | undefined, now = Date.now()): number | null {
  if (!lastSeenAt) return null;
  const then = Date.parse(lastSeenAt);
  return Number.isNaN(then) ? null : Math.max(0, now - then);
}

export function seenAgo(lastSeenAt: string | null | undefined, now = Date.now()): string {
  const age = ageMs(lastSeenAt, now);
  if (age === null) return "never seen";
  if (age < MINUTE) return "seen just now";
  if (age < HOUR) return `seen ${Math.round(age / MINUTE)} min ago`;
  if (age < DAY) {
    const hours = Math.round(age / HOUR);
    return `seen ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.round(age / DAY);
  return `seen ${days} ${days === 1 ? "day" : "days"} ago`;
}

export function isStale(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  const age = ageMs(lastSeenAt, now);
  return age === null || age > STALE_AFTER_MS;
}
