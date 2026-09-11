import { expect, test } from "bun:test";
import { ConnectionHealth, PING_INTERVAL_MS } from "./connection-health";

test("a ping-responsive idle peer stays healthy at every heartbeat", () => {
  const health = new ConnectionHealth(0);
  for (let now = PING_INTERVAL_MS; now <= 30000; now += PING_INTERVAL_MS) {
    expect(health.check(now)).toEqual({ stale: false, dead: false });
    health.hear("pong", now);
  }
});

test("a silent peer becomes stale, then dead, and a valid reply clears liveness", () => {
  const health = new ConnectionHealth(0);
  expect(health.check(11000)).toEqual({ stale: true, dead: false });
  expect(health.check(16000)).toEqual({ stale: true, dead: true });
  health.hear("pong", 17000);
  expect(health.check(17000)).toEqual({ stale: false, dead: false });
});

test("pongs do not mask missing telemetry from a streaming peer", () => {
  const health = new ConnectionHealth(0);
  health.hear("state", 0);
  health.hear("pong", 5000);
  expect(health.check(5000)).toEqual({ stale: true, dead: false });
  health.hear("state", 5100);
  expect(health.check(5100).stale).toBe(false);
});
