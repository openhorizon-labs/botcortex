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
import { shortBodyName } from "@/lib/robot/bodies";
import { BrowserSim, type FlushReport } from "@/lib/robot/browser-sim/host";
import type { ImportReport } from "@/lib/robot/browser-sim/worker";
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
    contract: { version: "test" }, platform: "openarm_v1", skills: [] as string[], unproven: [] as string[], stopped: false,
    scene: { fixtures: {}, objects: {} }, state: {}, memory: { durable: false },
    close: mock(() => {}), clearAbort: mock(() => {}),
    importSkills: mock(async (): Promise<ImportReport & { memory: FlushReport | null }> =>
      ({ restored: [], kept: [], rejected: [], push: [], memory: null })),
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
    // The REASON has to reach the owner, not just the word "failed". This used
    // to say "Teaching failed. The browser console has the details.", which is
    // the same sentence for every unrecognised failure and sends a person with
    // a robot somewhere they have never opened.
    const said = events.find((event) => event.type === "chat" && event.text.startsWith("Teaching stopped"));
    expect(said).toBeDefined();
    expect((said as { text: string }).text).toContain("runtime crashed");
    expect((said as { text: string }).text).not.toContain("console");
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
    if (url.startsWith("/api/skills?")) return new Response(null, { status: 404 });
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

test("signed in, the store is rebuilt from the account registry before the hello, and what it lacks is pushed up", async () => {
  useLocks();
  const posted: Record<string, unknown>[] = [];
  const rows = [
    { name: "wave", description: "Wave.", code: "def run(ctx): pass", platform: "roarm_m2", proven: true, updatedAt: 1000 },
  ];
  apiStub(async (url, init) => {
    if (url === "/api/me") return Response.json({ user: { id: "acct-7" } });
    if (url === "/api/skills?platform=roarm_m2") return Response.json({ skills: rows });
    if (url === "/api/skills" && init?.method === "POST") { posted.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
    return new Response(null, { status: 404 });
  });
  const sim = fakeSim();
  sim.platform = "roarm_m2";
  sim.memory = { durable: true };
  sim.importSkills.mockImplementation(async () => {
    sim.skills = ["wave", "local_only"];
    sim.unproven = ["local_only"];
    return { restored: ["wave"], kept: [], rejected: [], push: [{ name: "local_only", description: "Mine.", code: "def run(ctx): return 1", proven: false }], memory: { flushed: true } };
  });
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    await settle();
    expect(sim.importSkills).toHaveBeenCalledWith(rows);
    // The hello already knows the restored skill.
    expect(events.find((event) => event.type === "hello")).toMatchObject({ skills: ["wave", "local_only"], unproven: ["local_only"] });
    expect(events.find((event) => event.type === "memory")).toMatchObject({ durable: true, detail: expect.stringContaining("1 restored") });
    // The registry gets the skill only this browser had, with its platform.
    expect(posted).toEqual([{ name: "local_only", description: "Mine.", code: "def run(ctx): return 1", platform: "roarm_m2", proven: false }]);
    expect(events.find((event) => event.type === "sync")).toEqual({ type: "sync", skill: "local_only", ok: true });
  } finally { transport.close(); }
});

test("a registry that is away leaves the local store alone", async () => {
  useLocks();
  apiStub(async (url) => {
    if (url === "/api/me") return Response.json({ user: { id: "acct-7" } });
    return new Response(null, { status: 503 });
  });
  const sim = fakeSim();
  sim.skills = ["wave"];
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    expect(sim.importSkills).not.toHaveBeenCalled();
    expect(events.find((event) => event.type === "hello")).toMatchObject({ skills: ["wave"] });
  } finally { transport.close(); }
});

test("a skill seen to run is marked proven in the registry; one the registry never got is sent whole", async () => {
  useLocks();
  const calls: string[] = [];
  const posted: Record<string, unknown>[] = [];
  let ranStatus = 200;
  apiStub(async (url, init) => {
    if (url === "/api/me") return Response.json({ user: { id: "acct-7" } });
    if (url.startsWith("/api/skills?")) return Response.json({ skills: [] });
    if (url === "/api/skills/wave/ran") { calls.push(JSON.parse(String(init?.body)).platform); return new Response(null, { status: ranStatus }); }
    if (url === "/api/skills" && init?.method === "POST") { posted.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); }
    return new Response(null, { status: 404 });
  });
  const sim = fakeSim();
  sim.platform = "roarm_m2";
  sim.importSkills.mockImplementation(async () => {
    sim.skills = ["wave"];
    sim.unproven = ["wave"];
    return { restored: [], kept: ["wave"], rejected: [], push: [{ name: "wave", description: "Wave.", code: "def run(ctx): pass", proven: false }], memory: null };
  });
  sim.runTool.mockImplementation(async () => {
    sim.unproven = [];
    return { plain: "Ran skill", output: "ok", memory: null };
  });
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    await settle();
    expect(posted).toHaveLength(1);
    await transport.send({ type: "run_skill", name: "wave", dryRun: true }, "test");
    await settle();
    expect(calls).toEqual(["roarm_m2"]);
    expect(posted).toHaveLength(1);

    // The registry lost the row: the proof call 404s and the whole skill,
    // now proven, goes up instead.
    ranStatus = 404;
    sim.unproven = ["wave"];
    await transport.send({ type: "run_skill", name: "wave", dryRun: true }, "test");
    await settle();
    await settle();
    expect(calls).toEqual(["roarm_m2", "roarm_m2"]);
    expect(posted.at(-1)).toMatchObject({ name: "wave", platform: "roarm_m2", proven: true });
  } finally { transport.close(); }
});

test("a body's name drops the provenance its descriptor carries, and nothing else", () => {
  // "Franka Emika Panda (MuJoCo Menagerie) (browser sim)" was 50 characters
  // of two nested parentheticals, and it widened the connect dialog until the
  // Disconnect button fell off the right edge. Where a model came from is
  // credited on /skills; a robot's name is not the place for it.
  expect(shortBodyName("Franka Emika Panda (MuJoCo Menagerie)")).toBe("Franka Emika Panda");
  expect(shortBodyName("Trossen ViperX 300s (ALOHA, MuJoCo Menagerie)")).toBe("Trossen ViperX 300s");
  expect(shortBodyName("SO-101 (LeRobot, MuJoCo Menagerie)")).toBe("SO-101");
  // A parenthetical that is part of the name, not a source, stays: the
  // OpenArm is bimanual and the RoArm comes in two variants, and dropping
  // that would make two different bodies read the same.
  expect(shortBodyName("OpenArm v1 (bimanual)")).toBe("OpenArm v1");
  expect(shortBodyName("Waveshare RoArm-M2 (S/Pro)")).toBe("Waveshare RoArm-M2");
  // Never strip to nothing.
  expect(shortBodyName("(only a parenthetical)")).toBe("(only a parenthetical)");
  expect(shortBodyName("Plain Name")).toBe("Plain Name");
  // A body that never said what it is called still gets a name, because the
  // alternative is a crash inside the hello.
  expect(shortBodyName(undefined)).toBe("Robot");
});

test("interrupt stops a running task without latching the e-stop", async () => {
  apiStub();
  const sim = fakeSim();
  let finish!: (reply: { plain: string; output: string; memory: null }) => void;
  sim.runTool.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event));
  try {
    await transport.open();
    // Nothing running: the control must not claim to have stopped anything.
    expect(transport.interrupt()).toBe(false);

    const job = transport.send({ type: "run_skill", name: "wave", dryRun: true }, "test");
    expect(transport.interrupt()).toBe(true);
    // The e-stop is the OTHER button. Interrupting must not latch it, or
    // "not that task" would leave the robot needing a deliberate reset.
    expect(sim.stop).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "estop")).toBe(false);
    expect(events.some((e) => e.type === "chat" && e.text.startsWith("Stopped."))).toBe(true);

    finish({ plain: "Done", output: "ok", memory: null });
    await job;
    expect(events.at(-1)).toEqual({ type: "status", state: "idle" });
    // And it is idle again, so a second press has nothing to stop.
    expect(transport.interrupt()).toBe(false);
  } finally { transport.close(); }
});

test("before a recall the host asks the api which skills MEAN the same, and says nothing when it cannot", async () => {
  const candidates = [
    { name: "put_block_in_tray", text: "put block in tray: Put a block in a tray." },
    { name: "wave", text: "wave: Wave." },
  ];
  const sim = { callTool: mock(async () => JSON.stringify(candidates)) } as unknown as BrowserSim;
  const transport = new BrowserSimTransport(() => {});
  const asked: { url: string; body: any }[] = [];
  let answer: Response | Error = Response.json({ ranked: [{ name: "put_block_in_tray", score: 0.9 }, { name: "wave", score: 0.1 }] });
  (transport as any).request = async (url: string, init: RequestInit) => {
    asked.push({ url, body: JSON.parse(String(init.body)) });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const rank = (query: string) => (transport as any).rankedSkills(sim, query) as Promise<string[] | null>;

  expect(await rank("tidy the bench")).toEqual(["put_block_in_tray", "wave"]);
  // Names and what each skill says it does. Never its code.
  expect(asked[0]).toEqual({ url: "/api/similar", body: { query: "tidy the bench", candidates } });

  answer = Response.json({ ranked: null }); // no credit, no key, provider down
  expect(await rank("tidy the bench")).toBeNull();
  answer = new Error("offline");
  expect(await rank("tidy the bench")).toBeNull();

  // One working skill, or none, needs no ranking and costs no call.
  const calls = asked.length;
  (sim.callTool as any).mockResolvedValue(JSON.stringify(candidates.slice(0, 1)));
  expect(await rank("tidy the bench")).toBeNull();
  expect(asked.length).toBe(calls);
});

test("an account's runs are posted as training data; a signed-out visitor's are nobody's to keep", async () => {
  const episode = { event: "episode", episode: { id: "e1789600000001-wave", ok: true } };
  for (const [account, expected] of [["acct-7", 1], [null, 0]] as const) {
    useLocks();
    const posted: string[] = [];
    apiStub((url, init) => {
      if (url.endsWith("/api/me")) return account ? Response.json({ user: { id: account } }) : new Response(null, { status: 401 });
      if (url === "/api/episodes") { posted.push(String(init?.body)); return Response.json({ ok: true }); }
      return new Response(null, { status: 404 });
    });
    const boot = spyOn(BrowserSim, "boot").mockResolvedValue(fakeSim() as unknown as BrowserSim);
    const transport = new BrowserSimTransport(() => {});
    try {
      await transport.open();
      const options = boot.mock.calls.at(-1)![1] as { onEpisode: (event: unknown) => void };
      options.onEpisode(episode);
      // The account fetcher checks who is signed in before it sends.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(posted).toHaveLength(expected);
      if (expected) expect(JSON.parse(posted[0])).toEqual(episode);
    } finally { transport.close(); boot.mockRestore(); }
  }
});

test("proof granted at the verdict reaches the registry: the gate letting a task stand is what marks its skill ran", async () => {
  // Wheel 0.0.24: a skill the AGENT ran is proven when its report(done=True)
  // survives the gate, not when the run completes. So the flip from unproven
  // to proven happens inside verify(), and the registry must hear it from there.
  useLocks();
  const ran: string[] = [];
  let turn = 0;
  apiStub(async (url, init) => {
    if (url === "/api/me") return Response.json({ user: { id: "acct-7" } });
    if (url.startsWith("/api/skills?")) return Response.json({ skills: [] });
    if (url === "/api/skills/nod/ran") { ran.push(JSON.parse(String(init?.body)).platform); return Response.json({ ok: true }); }
    if (url === "/api/skills" && init?.method === "POST") return Response.json({ ok: true });
    return Response.json({ choices: [{ message: turn++ === 0
      ? { tool_calls: [{ id: "run", function: { name: "run_skill", arguments: JSON.stringify({ name: "nod", params_json: "{}" }) } }] }
      : { content: "Nodded." } }] });
  });
  const sim = Object.assign(fakeSim(), {
    contract: { version: "test", system_prompt: "test", max_iterations: 2, tools: [{ name: "run_skill", description: "run", parameters: { type: "object", properties: {} } }] },
    callTool: async () => "[]", beginTask: async () => {}, logEpisode: async () => ({ flushed: true }),
    verify: async () => { sim.unproven = []; return null; },
  });
  sim.skills = ["nod"];
  sim.unproven = ["nod"];
  // The run itself proves nothing now: the store still lists nod as unproven.
  sim.runTool.mockResolvedValue({ output: "Rehearsed clean, then nod ran (1 primitive calls).", plain: "It ran.", memory: null });
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event), { accountId: "acct-7" });
  try {
    await transport.open();
    await transport.send({ type: "chat", text: "nod", dryRun: true, runId: "run" }, "test");
    await settle();
    expect(ran).toEqual(["openarm_v1"]);
    const skillsEvents = events.filter((event) => event.type === "skills") as { unproven?: string[] }[];
    expect(skillsEvents.at(-1)?.unproven).toEqual([]);
  } finally { transport.close(); }
});

test("deleting a draft removes it from the robot and the registry; a proven skill is refused by the robot and never reaches the registry", async () => {
  useLocks();
  const deleted: string[] = [];
  apiStub(async (url, init) => {
    if (url === "/api/me") return Response.json({ user: { id: "acct-7" } });
    if (url.startsWith("/api/skills?")) return Response.json({ skills: [] });
    if (url.startsWith("/api/skills/") && init?.method === "DELETE") { deleted.push(url); return Response.json({ ok: true }); }
    if (url === "/api/skills" && init?.method === "POST") return Response.json({ ok: true });
    return new Response(null, { status: 404 });
  });
  const sim = Object.assign(fakeSim(), {
    deleteSkill: mock(async (name: string) => {
      if (name === "draft") {
        sim.skills = ["works"];
        sim.unproven = [];
        return { done: true, plain: "Deleted draft. It was never seen to work, so nothing else refers to it.", memory: null };
      }
      return { done: false, plain: `${name} has been seen to work, so it is on the public registry and cannot be deleted.`, memory: null };
    }),
  });
  sim.skills = ["draft", "works"];
  sim.unproven = ["draft"];
  spyOn(BrowserSim, "boot").mockResolvedValue(sim as unknown as BrowserSim);
  const events: RobotMessage[] = [];
  const transport = new BrowserSimTransport((event) => events.push(event), { accountId: "acct-7" });
  try {
    await transport.open();
    await transport.send({ type: "delete_skill", name: "draft" }, "test");
    await settle();
    const last = (type: RobotMessage["type"]) => events.filter((event) => event.type === type).at(-1);
    expect(deleted).toEqual(["/api/skills/draft?platform=openarm_v1"]);
    expect(last("chat")).toMatchObject({ text: expect.stringMatching(/^Deleted draft/) });
    expect(last("skills")).toEqual({ type: "skills", skills: ["works"], unproven: [] });

    await transport.send({ type: "delete_skill", name: "works" }, "test");
    await settle();
    expect(deleted).toHaveLength(1);
    expect(last("chat")).toMatchObject({ text: expect.stringContaining("cannot be deleted") });
    expect(last("skills")).toEqual({ type: "skills", skills: ["works"], unproven: [] });
  } finally { transport.close(); }
});
