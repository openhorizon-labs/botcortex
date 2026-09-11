/**
 * The transport helpers.
 *
 * mixedContentBlocked is the interesting one: it decides, before any attempt
 * is made, whether a https page is allowed to dial an address at all.
 */
import { afterEach, expect, test } from "bun:test";

import { httpUrl, mixedContentBlocked, normalizeHost, parseRobotEndpoint, wsUrl, parseRobotMessage } from "@/lib/robot/protocol";

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
  expect(wsUrl({ host: "sim.openhorizon.so", secure: true, explicitScheme: false })).toBe("wss://sim.openhorizon.so/ws");
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

test("normalizeHost keeps the authority and refuses a path", () => {
  expect(normalizeHost("  http://192.168.1.42:9090/ ")).toBe("192.168.1.42:9090");
  expect(normalizeHost("wss://thor.local:9090")).toBe("thor.local:9090");
  expect(normalizeHost("http://192.168.1.42:9090/app")).toBe("");
});

/* B06 — the endpoint table. Page protocol × address shape × explicit scheme,
   with the URLs each case must produce. */
test.each<[string, string, string, boolean, string]>([
  // page, typed, host, secure, ws url
  ["http:", "192.168.1.42:9090", "192.168.1.42:9090", false, "ws://192.168.1.42:9090/ws"],
  ["https:", "192.168.1.42:9090", "192.168.1.42:9090", true, "wss://192.168.1.42:9090/ws"],
  ["https:", "ws://localhost:9090", "localhost:9090", false, "ws://localhost:9090/ws"],
  ["http:", "wss://robot.example.com", "robot.example.com", true, "wss://robot.example.com/ws"],
  ["http:", "https://robot.example.com:8443/", "robot.example.com:8443", true, "wss://robot.example.com:8443/ws"],
  ["http:", "[::1]:9090", "[::1]:9090", false, "ws://[::1]:9090/ws"],
  // Zone IDs (fe80::1%eth0) are not URL-addressable in any browser, so they
  // are not in this table: the parser refuses them, as the rejection table
  // below records.
  ["http:", "ws://[fe80::1]:9090", "[fe80::1]:9090", false, "ws://[fe80::1]:9090/ws"],
  ["http:", "THOR.LOCAL:9090", "thor.local:9090", false, "ws://thor.local:9090/ws"],
  ["http:", "  thor.local  ", "thor.local", false, "ws://thor.local/ws"],
])("endpoint on a %s page: %s", (page, typed, host, secure, ws) => {
  const parsed = parseRobotEndpoint(typed, page);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.endpoint.host).toBe(host);
  expect(parsed.endpoint.secure).toBe(secure);
  expect(wsUrl(parsed.endpoint)).toBe(ws);
  expect(httpUrl(parsed.endpoint)).toBe(ws.replace(/^ws/, "http").replace(/\/ws$/, ""));
});

test.each([
  "", "   ", "user:pw@thor.local:9090", "thor.local:9090?x=1", "thor.local:9090#frag",
  "thor.local:9090/ws", "thor local", "http://", "[::1", "thor.local:99999", "[fe80::1%25eth0]:9090",
])("rejects a bad address: %j", (typed) => {
  const parsed = parseRobotEndpoint(typed, "http:");
  expect(parsed.ok).toBe(false);
  if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
});

test("an explicit plain scheme on a https page is refused for everything but loopback", () => {
  pageOn("https:");
  const plain = (typed: string) => {
    const parsed = parseRobotEndpoint(typed, "https:");
    if (!parsed.ok) throw new Error(parsed.error);
    return mixedContentBlocked(parsed.endpoint, "https:");
  };
  expect(plain("ws://localhost:9090")).toBe(false);
  expect(plain("ws://[::1]:9090")).toBe(false);
  expect(plain("ws://robot.example.com:9090")).toBe(true);
  expect(plain("wss://192.168.1.42:9090")).toBe(false);
  expect(plain("[fd00::5]:9090")).toBe(true);
  expect(plain("[2001:db8::5]:9090")).toBe(false);
});

test("runId rides on execution events and memory reports are validated", () => {
  const tool = { type: "tool" as const, id: "a", name: "move_to", input: {}, runId: "run-1" };
  expect(parseRobotMessage(JSON.stringify(tool))).toEqual(tool);
  expect(parseRobotMessage(JSON.stringify({ ...tool, runId: 5 }))).toBeNull();
  const memory = { type: "memory" as const, durable: false, unsaved: true, detail: "another tab" };
  expect(parseRobotMessage(JSON.stringify(memory))).toEqual(memory);
  expect(parseRobotMessage(JSON.stringify({ type: "memory", durable: "yes", unsaved: false }))).toBeNull();
});

test.each(["{", "null", "[]", '{"type":"chat","text":{}}', '{"type":"tool","id":"a","name":"move_to","input":null}', '{"type":"state","arms":{"right":{"j1":"NaN"}}}', '{"type":"estop","stopped":"false"}'])("rejects malformed robot message: %s", (raw) => {
  expect(parseRobotMessage(raw)).toBeNull();
});

test("accepts compatible hello and state events with extra fields", () => {
  const hello = { type: "hello" as const, robot: { name: "Sim", platform: "wasm" }, skills: [], future: true };
  expect(parseRobotMessage(JSON.stringify(hello))).toEqual(hello);
  const state = { type: "state" as const, arms: { right: { j1: 5 } }, objects: {} };
  expect(parseRobotMessage(JSON.stringify(state))).toEqual(state);
});

test("rejects geometry that would divide by zero or crash the scene", () => {
  expect(parseRobotMessage(JSON.stringify({ type: "hello", robot: { name: "Sim", platform: "wasm", gripper: { minDeg: 0, maxDeg: 0, travelM: 1 } }, skills: [] }))).toBeNull();
  expect(parseRobotMessage(JSON.stringify({ type: "state", arms: {}, objects: { cube: { position: [1, 2] } } }))).toBeNull();
});
