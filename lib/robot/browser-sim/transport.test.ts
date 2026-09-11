/**
 * The transcript the browser sim hands its agent.
 *
 * "keep the red block back" only means something WITH the exchange it
 * answers — each teach is a fresh model conversation, and this rendering is
 * how the conversation reaches it. Mirrors agent.py's _transcript, pinned on
 * both sides so a robot and a browser read the same words the same way.
 */
import { afterEach, expect, mock, spyOn, test } from "bun:test";

import { BrowserSimTransport, transcriptOf } from "@/lib/robot/browser-sim/transport";
import { BrowserSim } from "@/lib/robot/browser-sim/host";
import type { RobotMessage } from "@/lib/robot/protocol";

const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => {
  mock.restore(); globalThis.fetch = originalFetch;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

function useLocks(beforeAcquire: () => Promise<void> = async () => {}) {
  const held = new Set<string>();
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: {
    request: async (name: string, _options: unknown, callback: (lock: object | null) => unknown) => {
      await beforeAcquire();
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  } } });
  return held;
}

/** The account api, as a test sees it: signed out unless told otherwise. */
function apiStub(handler: (url: string, init?: RequestInit) => Response | Promise<Response> = () => new Response(null, { status: 401 })) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
}

/** `open()` looks the account up before booting; let that settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("no history, no block", () => {
  expect(transcriptOf(undefined)).toBe("");
  expect(transcriptOf([])).toBe("");
  expect(transcriptOf([{ role: "owner", text: "" }])).toBe("");
});

test("the conversation renders as Owner/Robot lines, in order", () => {
  const rendered = transcriptOf([
    { role: "owner", text: "Put the red block in the right tray" },
    { role: "robot", text: "The red block was placed in the right tray." },
    { role: "owner", text: "keep the red block back" },
  ]);
  expect(rendered).toContain("The conversation so far");
  expect(rendered).toContain("Owner: Put the red block in the right tray");
  expect(rendered).toContain("Robot: The red block was placed in the right tray.");
  expect(rendered.indexOf("Owner: Put the red block")).toBeLessThan(
    rendered.indexOf("Owner: keep the red block back"),
  );
  expect(rendered.endsWith("\n\n")).toBe(true);
});

function fakeSim() {
  return {
    contract: { version: "test" }, skills: [], unproven: [], stopped: false,
    scene: { fixtures: {}, objects: {} }, state: {}, memory: { durable: false },
    close: mock(() => {}), clearAbort: mock(() => {}),
    runTool: mock(async (): Promise<{ plain: string; output: string; memory: { flushed: boolean; error?: string } | null }> =>
      ({ plain: "Ran skill", output: "ok", memory: null })),
    stop: mock(async () => {}), resetStop: mock(async () => {}),
  };
}

test("closing during boot closes the late worker and emits no stale hello", async () => {
  apiStub();
  const sim = fakeSim();
  let finish!: (sim: BrowserSim) => void;
  spyOn(BrowserSim, "boot").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  const opened = transport.open();
  await settle();
  transport.close();
  finish(sim as unknown as BrowserSim);
  await expect(opened).rejects.toThrow("closed while starting");
  expect(sim.close).toHaveBeenCalledTimes(1);
  expect(events).toEqual([]);
});

test("tool rejection is handled, explained and returns the transport to idle", async () => {
  apiStub();
  const sim = fakeSim();
  sim.runTool.mockRejectedValue(new Error("runtime crashed"));
  spyOn(console, "error").mockImplementation(() => {});
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    await transport.send({ type: "run_skill", name: "wave", dryRun: true }, "test");
    expect(events.some((event) => event.type === "chat" && event.text.includes("failed"))).toBe(true);
    expect(events.at(-1)).toEqual({ type: "status", state: "idle" });
  } finally { transport.close(); }
});

test("a late job result after close cannot reach the new connection", async () => {
  apiStub();
  const sim = fakeSim();
  let finish!: (reply: { plain: string; output: string; memory: null }) => void;
  sim.runTool.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  await transport.open();
  const job = transport.send({ type: "run_skill", name: "wave", dryRun: true }, "test");
  transport.close();
  const count = events.length;
  finish({ plain: "Done", output: "ok", memory: null });
  await job;
  expect(events).toHaveLength(count);
});

test("a failed STOP acknowledgement does not announce a latched stop", async () => {
  apiStub();
  const sim = fakeSim();
  sim.stop.mockRejectedValue(new Error("worker stopped"));
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    await expect(transport.stop()).rejects.toThrow("worker stopped");
    expect(events.some((event) => event.type === "estop")).toBe(false);
  } finally { transport.close(); }
});

test("the account id becomes the memory namespace, and the hello is followed by a memory report", async () => {
  useLocks();
  apiStub((url) => url.endsWith("/api/me") ? Response.json({ user: { id: "acct-7" } }) : new Response(null, { status: 404 }));
  const sim = fakeSim();
  sim.memory = { durable: true };
  const boot = spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    expect(boot.mock.calls[0][1]).toMatchObject({ namespace: "acct-7" });
    const memory = events.find((event) => event.type === "memory");
    expect(memory).toMatchObject({ type: "memory", durable: true, unsaved: false });
  } finally { transport.close(); }
});

test("signed out, the robot boots session-only and says so", async () => {
  apiStub();
  const sim = fakeSim();
  const boot = spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    expect(boot.mock.calls[0][1]).toMatchObject({ namespace: null });
    expect(events.find((event) => event.type === "memory")).toMatchObject({ durable: false, detail: expect.stringContaining("Not signed in") });
  } finally { transport.close(); }
});

test("a run's events carry the client's runId, and a failed flush is reported as unsaved", async () => {
  apiStub();
  const sim = fakeSim();
  sim.memory = { durable: true };
  sim.runTool.mockResolvedValue({ plain: "Ran skill", output: "ok", memory: { flushed: false, error: "quota" } });
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    await transport.send({ type: "run_skill", name: "wave", dryRun: true, runId: "run-9" }, "test");
    const scoped = events.filter((event) => "runId" in event && event.runId === "run-9").map((event) => event.type);
    expect(scoped).toEqual(expect.arrayContaining(["status", "chat"]));
    // The hello and the state stream are not a run's.
    expect(events.find((event) => event.type === "hello")).not.toHaveProperty("runId");
    expect(events.find((event) => event.type === "memory" && event.unsaved)).toMatchObject({ durable: true, unsaved: true, detail: expect.stringContaining("quota") });
  } finally { transport.close(); }
});

test("sync_skill retries a skill saved this session and reports one it never saw", async () => {
  const posted: unknown[] = [];
  apiStub(async (url, init) => {
    if (url.endsWith("/api/skills")) { posted.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }); }
    return new Response(null, { status: 401 });
  });
  const sim = fakeSim();
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    await transport.send({ type: "sync_skill", name: "never_saved" }, "test");
    expect(events.at(-1)).toEqual({ type: "sync", skill: "never_saved", ok: false });
    expect(posted).toHaveLength(0);
  } finally { transport.close(); }
});

test("a dead worker closes the transport and tells the owner", async () => {
  apiStub();
  const sim = fakeSim();
  const boot = spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const deaths: string[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event), { onDead: (reason) => deaths.push(reason) });
  await transport.open();
  const options = boot.mock.calls[0][1] as { onDead: (reason: string) => void };
  options.onDead("the in-browser robot did not answer");
  expect(deaths).toEqual(["the in-browser robot did not answer"]);
  expect(events.at(-1)).toMatchObject({ type: "chat", text: expect.stringContaining("Reconnect") });
  await expect(transport.stop()).resolves.toBe(false);
});

test("closing during account lookup never acquires a lease or boots", async () => {
  const held = useLocks();
  let finish!: (response: Response) => void;
  apiStub(() => new Promise((resolve) => { finish = resolve; }));
  const boot = spyOn(BrowserSim, "boot").mockResolvedValue(fakeSim() as unknown as BrowserSim);
  const transport = new BrowserSimTransport(() => {});
  const opening = transport.open();
  transport.close();
  finish(Response.json({ user: { id: "A" } }));
  await expect(opening).rejects.toThrow();
  expect(boot).not.toHaveBeenCalled();
  expect(held.size).toBe(0);
});

test("a lease granted after cancellation is immediately released", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const held = useLocks(() => gate);
  apiStub(() => Response.json({ user: { id: "A" } }));
  const boot = spyOn(BrowserSim, "boot").mockResolvedValue(fakeSim() as unknown as BrowserSim);
  const transport = new BrowserSimTransport(() => {});
  const opening = transport.open();
  await settle();
  transport.close();
  await expect(opening).rejects.toThrow();
  release();
  await settle();
  expect(held.size).toBe(0);
  expect(boot).not.toHaveBeenCalled();
  const next = new BrowserSimTransport(() => {});
  await next.open();
  expect(held.size).toBe(1);
  next.close();
  await settle();
  expect(held.size).toBe(0);
});

test("a failed boot releases its account's lease", async () => {
  const held = useLocks();
  apiStub(() => Response.json({ user: { id: "A" } }));
  spyOn(BrowserSim, "boot").mockRejectedValue(new Error("bad wheel"));
  await expect(new BrowserSimTransport(() => {}).open()).rejects.toThrow("bad wheel");
  await settle();
  expect(held.size).toBe(0);
});

test("a sync retry cannot submit A's cached skill after signing in as B", async () => {
  useLocks();
  let account = "A";
  let turn = 0;
  const posted: string[] = [];
  apiStub(async (url) => {
    if (url === "/api/me") return Response.json({ user: { id: account } });
    if (url === "/api/skills") { posted.push(account); return new Response(null, { status: 503 }); }
    return Response.json({ choices: [{ message: turn++ === 0
      ? { tool_calls: [{ id: "save", function: { name: "save_skill", arguments: JSON.stringify({ name: "private_a", code: "private fixture" }) } }] }
      : { content: "saved" } }] });
  });
  const sim = Object.assign(fakeSim(), {
    contract: { version: "test", system_prompt: "test", max_iterations: 2, tools: [{ name: "save_skill", description: "save", parameters: { type: "object", properties: {} } }] },
    callTool: async () => "[]", beginTask: async () => {}, verify: async () => null,
    logEpisode: async () => ({ flushed: true }),
  });
  sim.runTool.mockResolvedValue({ output: "saved private_a", plain: "saved", memory: { flushed: true } });
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const changed = mock(() => {});
  const transport = new BrowserSimTransport(() => {}, { accountId: "A", onAccountChanged: changed });
  await transport.open();
  await transport.send({ type: "chat", text: "save", dryRun: true, runId: "run" }, "test");
  await settle();
  expect(posted).toEqual(["A"]);
  account = "B";
  await transport.send({ type: "sync_skill", name: "private_a" }, "test");
  expect(posted).toEqual(["A"]);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(sim.close).toHaveBeenCalledTimes(1);
});
