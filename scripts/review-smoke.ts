/** Regression checks for the review's run ownership, recovery and account changes.
 * Requires bun dev on :3000, API_URL=http://localhost:8787 and port 8787 free.
 * Uses only a disposable loopback fixture and a fresh Chrome context. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = "http://localhost:3000";
const rows: Array<Record<string, any>> = [];
const runtime: { ws?: { send: (raw: string) => unknown }; runId?: string; pongs: number; closed: number } = { pongs: 0, closed: 0 };
let account = "A";
let delayB = false;
let bRequested: (() => void) | null = null;
let failCreate = false;
let created = 0;
let skillWrites = 0;
const fixture = Bun.serve({
  hostname: "127.0.0.1", port: 8787,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws" && server.upgrade(req)) return;
    if (!req.headers.get("cookie")?.includes("review-fixture")) return Response.json({}, { status: 401 });
    switch (url.pathname) {
      case "/api/me": return Response.json({ user: { id: account, name: `Owner ${account}`, email: `${account}@example.invalid` } });
      case "/api/auth/get-session": return Response.json({ user: { id: account, name: `Owner ${account}`, email: `${account}@example.invalid` }, session: { id: account, userId: account, expiresAt: "2099-01-01T00:00:00Z" } });
      case "/api/robots": return Response.json({ robots: [] });
      case "/api/credits": return Response.json({ balanceMicros: 0, display: "$0", spentDisplay: "$0", usedDisplay: "$0", grantedDisplay: "$0" });
      case "/api/models": return Response.json({ models: [], default: null });
      case "/api/skills": skillWrites++; return Response.json({ ok: true });
      case "/api/conversations":
        if (req.method === "POST") return failCreate ? new Response("offline", { status: 503 }) : Response.json({ id: `created-${++created}` });
        return Response.json({ conversations: ["a", "b"].map(id => ({ id, title: `Review ${id.toUpperCase()}`, messages: 1, updatedAt: "2026-09-11" })) });
      case "/api/messages": {
        if (req.method === "POST") { rows.push({ ...await req.json(), account }); return Response.json({ ok: true }); }
        const id = url.searchParams.get("conversation");
        if (id === "b" && delayB) { bRequested?.(); await Bun.sleep(1000); }
        return Response.json({ messages: account === "A" ? [
          { id: `${id}-seed`, author: "you", text: `SAVED HISTORY ${id?.toUpperCase()}`, createdAt: "2026-09-11T00:00:00Z" },
          ...rows.filter(row => row.conversationId === id && row.account === account).map(row => ({ ...row, createdAt: "2026-09-11T00:00:01Z" })),
        ] : [] });
      }
      default: return Response.json({}, { status: 404 });
    }
  },
  websocket: {
    open(ws) { runtime.ws = ws; ws.send(JSON.stringify({ type: "hello", robot: { name: "Review runtime", platform: "mock" }, skills: [], stopped: false })); },
    message(ws, raw) {
      const msg = JSON.parse(String(raw));
      if (msg.type === "ping") { runtime.pongs++; ws.send(JSON.stringify({ type: "pong" })); }
      if (msg.type === "chat") { runtime.runId = msg.runId; ws.send(JSON.stringify({ type: "status", state: "teaching", runId: msg.runId })); }
    },
    close() { runtime.closed++; },
  },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
let phase = "setup";
const emit = (msg: object) => runtime.ws!.send(JSON.stringify(msg));
async function until(check: () => boolean, description: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await Bun.sleep(50);
  }
  assert.fail(description);
}
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.addCookies([{ name: "better-auth.session_token", value: "review-fixture", domain: "localhost", path: "/" }]);
  await context.addInitScript(() => localStorage.setItem("botcortex.robot", JSON.stringify({ host: "127.0.0.1:8787", secure: false, explicitScheme: true })));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/app/tasks/a`, { waitUntil: "domcontentloaded" });
  await page.getByText("SAVED HISTORY A", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Review runtime/ }).waitFor();
  await page.getByRole("textbox", { name: "Describe a robot task" }).fill("start reviewed run A");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await until(() => Boolean(runtime.runId), "run did not start");
  delayB = true;
  phase = "background run during history load";
  const bStarted = new Promise<void>(resolve => { bRequested = resolve; });
  await page.getByRole("button", { name: "Review B", exact: true }).click();
  await bStarted;
  emit({ type: "chat", text: "A is still working offscreen", runId: runtime.runId });
  await page.getByText("SAVED HISTORY B", { exact: true }).waitFor();
  assert.equal(await page.getByText("A is still working offscreen", { exact: true }).count(), 0);
  await until(() => rows.some(row => row.text === "A is still working offscreen"), "background event was not saved");
  assert.equal(rows.find(row => row.text === "A is still working offscreen")!.conversationId, "a");
  delayB = false;

  emit({ type: "chat", text: "FOREIGN RUN", runId: "unrecognized-external-run" });
  emit({ type: "tool", id: "foreign", name: "save_skill", input: {}, runId: "unrecognized-external-run" });
  emit({ type: "tool_result", id: "foreign", ok: true, result: "saved", runId: "unrecognized-external-run" });
  await Bun.sleep(200);
  assert(!rows.some(row => row.text === "FOREIGN RUN" || String(row.id).includes("foreign")));
  emit({ type: "status", state: "idle", runId: runtime.runId });
  await page.waitForTimeout(11000);
  assert(runtime.pongs >= 2);
  assert.equal(await page.getByText("telemetry stale", { exact: true }).count(), 0);

  failCreate = true;
  phase = "failed conversation creation";
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("textbox", { name: "Describe a robot task" }).fill("HELD PROMPT");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByText("1 unsaved", { exact: true }).waitFor();
  const heldRun = runtime.runId;
  emit({ type: "chat", text: "HELD REPLY", runId: heldRun });
  emit({ type: "tool", name: "get_positions", id: "held-call", input: { arm: "right" }, runId: heldRun });
  emit({ type: "tool_result", id: "held-call", ok: true, result: "{}", runId: heldRun });
  emit({ type: "status", state: "idle", runId: heldRun });
  assert(!rows.some(row => row.text === "HELD PROMPT"));
  await page.getByRole("button", { name: "Review B", exact: true }).click();
  phase = "switch away from failed draft";
  await page.getByText("SAVED HISTORY B", { exact: true }).waitFor();
  failCreate = false;
  await page.getByRole("button", { name: "retry", exact: true }).click();
  await until(() => rows.filter(row => row.conversationId === "created-1").length === 3, "held run was not saved exactly once");
  assert.equal(created, 1);
  assert.deepEqual(rows.filter(row => row.conversationId === "created-1").map(row => row.text).sort(), ["HELD PROMPT", "HELD REPLY", "get_positions"].sort());
  assert.equal(new URL(page.url()).pathname, "/app/tasks/b", "retry stole the selected task");

  phase = "new task native-history navigation";
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("textbox", { name: "Describe a robot task" }).fill("FRESH TASK PROMPT");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForURL(`${base}/app/tasks/created-2`);
  emit({ type: "chat", text: "FRESH TASK REPLY", runId: runtime.runId });
  emit({ type: "status", state: "idle", runId: runtime.runId });
  await page.getByText("FRESH TASK PROMPT", { exact: true }).waitFor();
  await page.getByText("FRESH TASK REPLY", { exact: true }).waitFor();
  await until(() => rows.filter(row => row.conversationId === "created-2").length === 2, "new task was split across conversations");

  // A cross-tab session replacement must remount the entire account workspace.
  const otherTab = await context.newPage();
  phase = "cross-tab account change";
  await otherTab.bringToFront();
  account = "B";
  const rejectedWrite = await page.evaluate(async () => {
    const response = await fetch("/api/skills", {
      method: "POST", headers: { "x-botcortex-account": "A", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "private_a", code: "private fixture" }),
    });
    return response.status;
  });
  assert.equal(rejectedWrite, 409);
  assert.equal(skillWrites, 0, "server forwarded a write under the wrong account");
  const closedBefore = runtime.closed;
  await page.bringToFront();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: /Owner B/ }).waitFor();
  await until(() => runtime.closed > closedBefore, "old account's runtime connection stayed open");
  assert.equal(await page.getByText("SAVED HISTORY B", { exact: true }).count(), 0, "old account history remained visible");
  assert(!rows.some(row => row.account === "B"), "old-account work replayed under B");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: ["off-screen run persistence", "selected history survives background events", "unknown run rejection", "healthy idle heartbeat", "failed creation is visible", "original run recovers after task switch", "new task keeps its transcript", "server account binding", "cross-tab account reset"], pageErrors: errors }, null, 2));
} catch (error) {
  console.error("Review smoke failed at:", phase, "rows:", rows);
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    console.error(page.url(), (await page.locator("body").innerText()).slice(0, 1800));
  }
  throw error;
} finally {
  await browser.close();
  fixture.stop(true);
}
