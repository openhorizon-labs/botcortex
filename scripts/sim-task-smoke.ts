/** Reproduce the reported blue-next-to-red task in the shipped WASM runtime.
 * Uses a fresh Chrome context and session-only worker. No auth, model or robot.
 * Run with bun dev on :3000: bun scripts/sim-task-smoke.ts */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import artifact from "../public/botcortex/MANIFEST.json";
import { DEADLINES_MS } from "../lib/robot/browser-sim/host";

// The second (high-path) skill from task a686fdfc-fa0e-4c8b-a76e-dc5790508533.
// Keep this fixture independent of whichever model is used to teach next time.
const code = `META = {"name":"move_blue_next_to_red","description":"Move the blue block beside the red block using a high clear path.","params":{"arm":"right","side_offset":0.06}}
def run(ctx, **params):
    arm = params.get("arm", "right")
    offset = params.get("side_offset", 0.06)
    scene = ctx.describe_scene()
    blue = scene["objects"]["blue_block"]["position"]
    red = scene["objects"]["red_block"]["position"]
    high = max(blue[2], red[2]) + 0.25
    above_blue = [blue[0], blue[1], high]
    dest = [red[0], red[1] - offset, red[2]]
    above_dest = [dest[0], dest[1], high]
    release = [dest[0], dest[1], dest[2] + 0.04]
    ctx.gripper(arm, -65)
    ctx.move_to_point(arm, above_blue)
    ctx.move_to_point(arm, blue)
    ctx.gripper(arm, 0)
    ctx.move_to_point(arm, above_blue)
    ctx.move_to_point(arm, above_dest)
    ctx.move_to_point(arm, release)
    ctx.gripper(arm, -65)
    ctx.move_to_point(arm, above_dest)
`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/signin", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async ({ source, deadlines }) => {
    const worker = new Worker("/sim-worker.js", { type: "module" });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    worker.onmessage = ({ data }) => {
      if (!data.id) return;
      const waiter = pending.get(data.id);
      pending.delete(data.id);
      if (data.ok) waiter?.resolve(data.result); else waiter?.reject(new Error(data.error));
    };
    worker.onerror = (error) => {
      for (const waiter of pending.values()) waiter.reject(new Error(error.message));
    };
    const ask = (request: { type: keyof typeof deadlines; [key: string]: unknown }) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      const timeout = deadlines[request.type];
      const timer = setTimeout(() => {
        worker.terminate();
        for (const waiter of pending.values()) waiter.reject(new Error(`Simulation ${request.type} exceeded ${timeout / 1000} seconds`));
        pending.clear();
      }, timeout);
      pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      worker.postMessage({ ...request, id });
    });
    try {
      const boot = await ask({ type: "boot", namespace: null });
      await ask({ type: "beginTask" });
      const saved = await ask({ type: "callTool", name: "save_skill", args: { name: "move_blue_next_to_red", code: source } });
      if (!saved.output.startsWith("saved ")) throw new Error(saved.output);
      const started = Date.now();
      const run = await ask({ type: "callTool", name: "run_skill", args: { name: "move_blue_next_to_red", params_json: "{}" } });
      return {
        version: JSON.parse(boot.contract).version,
        before: boot.scene.objects,
        after: run.scene.objects,
        output: run.output,
        motionFrames: run.motion.length,
        computeMs: Date.now() - started,
      };
    } finally {
      worker.terminate();
    }
  }, { source: code, deadlines: DEADLINES_MS });
  assert.equal(result.version, artifact.contractVersion);
  assert(result.output.startsWith("Rehearsed clean"), result.output);
  assert(result.motionFrames > 0, "successful task returned no motion");
  const blue = result.after.blue_block.position as number[];
  const red = result.before.red_block.position as number[];
  assert(Math.abs(blue[0] - red[0]) < 0.015);
  assert(Math.abs(blue[1] - (red[1] - 0.06)) < 0.015);
  assert(Math.abs(blue[2] - 0.22) < 0.008);
  for (const name of ["red_block", "green_block"]) {
    assert(result.after[name].position.every((value: number, i: number) => Math.abs(value - result.before[name].position[i]) < 0.005), `${name} moved during blue's transfer`);
  }
  console.log(JSON.stringify({ passed: "blue next to red in the real WASM runtime", ...result }, null, 2));
} finally {
  await browser.close();
}
