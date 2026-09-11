/**
 * Local integration checks with a disposable account/runtime fixture.
 * Requires `bun dev` on 3000 with API_URL=http://localhost:8787, free port 8787,
 * and installed Chrome. No model calls, hardware, or real accounts are used.
 * Run: bun scripts/audit-smoke.ts
 */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = "http://localhost:3000";
const cookie = "better-auth.session_token=audit-fixture";
let stopFails = true;
let deletedB = false;
let closedSocket = false;
const runtime: { socket?: { close: () => void } } = {};
let historyRequested!: () => void;
const historyStarted = new Promise<void>((resolve) => { historyRequested = resolve; });
const transcript = (id: string) => [
  { id: `${id}-text`, author: "you", text: id === "a" ? "OLD TASK A" : "CURRENT TASK B", createdAt: "2026-09-11T00:00:00Z" },
  ...(id === "b" ? [
    { id: "b-tool", author: "robot", kind: "tool", text: "run_skill", payload: { name: "run_skill", input: { name: "wave" }, ok: false, result: "error: slipped" }, createdAt: "2026-09-11T00:00:01Z" },
    { id: "b-lesson", author: "robot", kind: "tool", text: "log_lesson", payload: { name: "log_lesson", input: { lesson: "Check the grip" }, ok: true, result: "saved" }, createdAt: "2026-09-11T00:00:02Z" },
  ] : []),
];
const cors = { "Access-Control-Allow-Origin": base, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const fixture = Bun.serve({
  hostname: "127.0.0.1", port: 8787,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/ws" && server.upgrade(request)) return;
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname === "/stop") return Response.json({ stopped: !stopFails }, { status: stopFails ? 500 : 200, headers: cors });
    if (url.pathname === "/stop/reset") return Response.json({ stopped: false }, { headers: cors });
    if (!request.headers.get("cookie")?.includes(cookie)) return Response.json({}, { status: 401 });
    switch (url.pathname) {
      case "/api/me": return Response.json({ user: { id: "audit", name: "Audit", email: "audit@example.invalid" } });
      case "/api/auth/get-session": return Response.json({ user: { id: "audit", name: "Audit", email: "audit@example.invalid" }, session: { id: "audit", userId: "audit", expiresAt: "2099-01-01T00:00:00Z" } });
      case "/api/robots": return Response.json({ robots: [] });
      case "/api/credits": return Response.json({ balanceMicros: 0, spentMicros: 0, grantedMicros: 0, display: "$0", spentDisplay: "$0", usedDisplay: "$0", grantedDisplay: "$0" });
      case "/api/models": return Response.json({ models: [], default: null });
      case "/api/device/pending": return Response.json({ pending: [] });
      case "/api/conversations": return Response.json({ conversations: (deletedB ? ["a"] : ["a", "b"]).map((id) => ({ id, title: `Task ${id.toUpperCase()}`, updatedAt: "2026-09-11", messages: 1 })) });
      case "/api/conversations/b": deletedB = true; return Response.json({ ok: true });
      case "/api/messages": {
        if (request.method !== "GET") return Response.json({ ok: true });
        const id = url.searchParams.get("conversation") ?? "a";
        if (id === "a") { historyRequested(); await Bun.sleep(1200); }
        return Response.json({ messages: transcript(id) });
      }
      default: return Response.json({ error: "fixture endpoint not implemented" }, { status: 404 });
    }
  },
  websocket: {
    open(ws) {
      runtime.socket = ws;
      ws.send(JSON.stringify({ type: "hello", robot: { name: "Audit runtime", platform: "mock" }, skills: [], stopped: false }));
    },
    message() {},
    close() { closedSocket = true; },
  },
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  // Keep a reference to the real worker for storage round-trip fixtures. Test
  // requests use negative ids and do not overlap the host's positive ids.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).endsWith("/sim-worker.js")) (window as unknown as { reviewWorker: Worker }).reviewWorker = this;
      }
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/signup`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Features", exact: true }).click();
  await page.waitForURL(`${base}/#features`, { waitUntil: "domcontentloaded" });
  await context.addCookies([{ name: "better-auth.session_token", value: "audit-fixture", domain: "localhost", path: "/" }]);
  await page.goto(`${base}/app/tasks/a`, { waitUntil: "domcontentloaded" });
  await historyStarted;
  await page.getByRole("button", { name: "Task B", exact: true }).click();
  await page.getByText("CURRENT TASK B", { exact: true }).waitFor();
  await page.waitForTimeout(1400);
  assert.equal(await page.getByText("OLD TASK A", { exact: true }).count(), 0, "stale history overwrote current task");
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence" }).click();
  const download = await downloadReady;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const evidence = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(evidence.taskId, "b");
  assert.equal(evidence.taskCompletion, "not-attested");
  assert.equal(evidence.summary.failed, 1);
  assert.equal(evidence.summary.lessonsRecorded, 1);
  await page.getByRole("button", { name: "Delete Task B", exact: true }).click();
  await page.waitForURL(`${base}/app/tasks/a`);
  await page.getByText("OLD TASK A", { exact: true }).waitFor();

  await page.getByRole("button", { name: /No robot/ }).click();
  await page.getByRole("menuitem", { name: "Connect a robot" }).click();
  await page.getByPlaceholder("192.168.1.42:9090 or thor.local:9090").fill("127.0.0.1:8787");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Emergency stop" }).click();
  await page.getByRole("alert").filter({ hasText: "STOP was not confirmed" }).waitFor();
  stopFails = false;
  runtime.socket?.close();
  await page.waitForTimeout(150);
  assert(closedSocket);
  assert(await page.getByRole("button", { name: "Emergency stop" }).isEnabled(), "REST stop disabled after socket close");
  await page.getByRole("button", { name: "Emergency stop" }).click();
  await page.getByText("Motion blocked", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Area is clear", exact: true }).click();
  await page.getByRole("button", { name: "Emergency stop" }).waitFor();

  // B07: STOP stays on screen on every signed-in route with a live connection.
  // A fresh document on the device route re-dials the remembered robot from
  // the layout-level provider, so the control must be there too.
  await page.goto(`${base}/app/device`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Pair a robot" }).waitFor();
  await page.getByRole("button", { name: "Emergency stop" }).waitFor();
  assert(await page.getByRole("button", { name: "Emergency stop" }).isEnabled(), "STOP not available on /app/device");

  // Use a fresh document to avoid the deliberately broken runtime retry path.
  await page.evaluate(() => localStorage.removeItem("botcortex.robot"));
  await page.goto(`${base}/app`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /No robot/ }).click();
  await page.getByRole("menuitem", { name: "Connect a robot" }).click();
  const started = Date.now();
  await page.getByRole("button", { name: /No robot\? Teach one here/ }).click();
  await page.getByRole("button", { name: "Done", exact: true }).waitFor({ timeout: 60000 });
  const bootMs = Date.now() - started;
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Show the simulation" }).click();
  await page.locator("canvas").waitFor();
  await page.getByRole("button", { name: "Emergency stop" }).click();
  await page.getByText("Motion blocked", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Area is clear", exact: true }).click();
  await page.getByRole("button", { name: "Emergency stop" }).waitFor();
  assert.equal(page.workers().filter((worker) => worker.url().endsWith("/sim-worker.js")).length, 1);

  // B02: signed in as "audit", the sim mounts IndexedDB under that account —
  // so no session-only warning, and a store named after the mount exists.
  assert.equal(await page.getByText("session-only memory", { exact: true }).count(), 0, "memory reported session-only for a signed-in account");
  const stores = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  assert(stores.includes("/data/audit"), `no IndexedDB store for the account: ${JSON.stringify(stores)}`);
  const saved = await page.evaluate(async () => {
    const worker = (window as unknown as { reviewWorker: Worker }).reviewWorker;
    const ask = (request: object, id: number) => new Promise<any>((resolve, reject) => {
      const receive = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        worker.removeEventListener("message", receive);
        if (event.data.ok) resolve(event.data.result); else reject(new Error(event.data.error));
      };
      worker.addEventListener("message", receive);
      worker.postMessage({ ...request, id });
    });
    const skill = await ask({ type: "callTool", name: "save_skill", args: {
      name: "audit_saved", code: 'META = {"name": "audit_saved", "description": "audit persistence", "params": {}}\ndef run(ctx, **params):\n    pass\n',
    } }, -1);
    const episode = await ask({ type: "logEpisode", task: "audit persistence", skills: ["audit_saved"], outcome: "fail", error: "fixture failure" }, -2);
    return { output: skill.output, skillFlushed: skill.memory.flushed, episodeFlushed: episode.flushed };
  });
  assert(saved.output.startsWith("saved audit_saved"));
  assert(saved.skillFlushed && saved.episodeFlushed);

  // B02: a second boot hydrates the same store rather than starting over.
  await page.getByRole("button", { name: /OpenArm v1 \(browser sim\)/ }).first().click();
  await page.getByRole("menuitem", { name: "Connect a robot" }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: /No robot\? Teach one here/ }).click();
  await page.getByRole("button", { name: "Done", exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await page.getByText("session-only memory", { exact: true }).count(), 0, "reconnect lost durable memory");
  await page.getByText("audit_saved", { exact: true }).waitFor();
  const recalled = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const worker = (window as unknown as { reviewWorker: Worker }).reviewWorker;
    const receive = (event: MessageEvent) => {
      if (event.data.id !== -3) return;
      worker.removeEventListener("message", receive);
      if (event.data.ok) resolve(event.data.result.output); else reject(new Error(event.data.error));
    };
    worker.addEventListener("message", receive);
    worker.postMessage({ id: -3, type: "callTool", name: "recall_episodes", args: { query: "audit persistence" } });
  }));
  assert(recalled.includes("fixture failure"), "failed episode did not survive reconnect");

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: ["public navigation", "stale history isolation", "evidence download", "delete navigation", "STOP failure feedback", "REST STOP after socket loss", "real WASM boot", "sim STOP/reset", "durable account memory", "STOP on /app/device", "reconnect hydration"], bootMs, pageErrors: errors }, null, 2));
} catch (error) {
  // What was on screen when it went wrong is the first thing anyone asks.
  for (const page of browser.contexts().flatMap((context) => context.pages())) {
    console.error("URL:", page.url());
    console.error("BODY:", (await page.locator("body").innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 800));
  }
  throw error;
} finally {
  await browser.close();
  fixture.stop(true);
}
