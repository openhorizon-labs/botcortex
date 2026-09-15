import { expect, test } from "bun:test";

import { isStale, seenAgo } from "@/lib/robot/seen";

const NOW = Date.parse("2026-09-16T12:00:00Z");

test("last seen reads in minutes, hours and days, and never for no date", () => {
  expect(seenAgo("2026-09-16T11:59:40Z", NOW)).toBe("seen just now");
  expect(seenAgo("2026-09-16T11:35:00Z", NOW)).toBe("seen 25 min ago");
  expect(seenAgo("2026-09-16T09:00:00Z", NOW)).toBe("seen 3 hours ago");
  expect(seenAgo("2026-09-13T12:00:00Z", NOW)).toBe("seen 3 days ago");
  expect(seenAgo(null, NOW)).toBe("never seen");
  expect(seenAgo("not a date", NOW)).toBe("never seen");
});

test("a robot is stale after an hour, or when it never announced", () => {
  expect(isStale("2026-09-16T11:30:00Z", NOW)).toBe(false);
  expect(isStale("2026-09-16T10:30:00Z", NOW)).toBe(true);
  expect(isStale(null, NOW)).toBe(true);
});
