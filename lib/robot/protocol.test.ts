/**
 * The transport helpers.
 *
 * mixedContentBlocked is the interesting one: it decides, before any attempt
 * is made, whether a https page is allowed to dial an address at all.
 */
import { afterEach, expect, test } from "bun:test";

import { mixedContentBlocked, normalizeHost, wsUrl } from "@/lib/robot/protocol";

function pageOn(protocol: "http:" | "https:") {
  // @ts-expect-error - a stand-in for the browser global
  globalThis.window = { location: { protocol } };
}
afterEach(() => {
  // @ts-expect-error - restore
  delete globalThis.window;
});

test("a plain http page may dial anything", () => {
  pageOn("http:");
  for (const host of ["192.168.1.42:9090", "thor.local:9090", "sim.openhorizon.so"]) {
    expect(mixedContentBlocked(host)).toBe(false);
  }
});

test("a https page cannot reach a LAN robot — it can only serve plain ws", () => {
  pageOn("https:");
  for (const host of [
    "192.168.1.42:9090",
    "10.0.0.5:9090",
    "172.16.4.2:9090",
    "172.31.255.1:9090",
    "169.254.1.1:9090",
    "thor.local:9090",
  ]) {
    expect(mixedContentBlocked(host)).toBe(true);
  }
});

test("a https page CAN reach a public host, because wss is not mixed content", () => {
  pageOn("https:");
  // The old rule blocked every one of these — which would have refused the
  // relay, and any hosted robot, before the first connection attempt.
  for (const host of ["sim.openhorizon.so", "robot.example.com:9090", "botcortex.fly.dev"]) {
    expect(mixedContentBlocked(host)).toBe(false);
  }
  expect(wsUrl("sim.openhorizon.so")).toBe("wss://sim.openhorizon.so/ws");
});

test("localhost is a secure context, LAN-shaped or not", () => {
  pageOn("https:");
  expect(mixedContentBlocked("localhost:9090")).toBe(false);
  expect(mixedContentBlocked("127.0.0.1:9090")).toBe(false);
  // 172.15 and 172.32 sit OUTSIDE the private /12 — an off-by-one here would
  // block real public addresses.
  expect(mixedContentBlocked("172.15.0.1")).toBe(false);
  expect(mixedContentBlocked("172.32.0.1")).toBe(false);
});

test("normalizeHost strips schemes and paths", () => {
  expect(normalizeHost("  http://192.168.1.42:9090/app ")).toBe("192.168.1.42:9090");
  expect(normalizeHost("wss://thor.local:9090")).toBe("thor.local:9090");
});
