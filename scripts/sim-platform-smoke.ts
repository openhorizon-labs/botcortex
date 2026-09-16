/** Boot the browser sim on a chosen body and run the portable pick-and-place.
 * Every body the wheel offers must accept the SAME skill source — the one that
 * reads ctx.arms and ctx.gripper_range instead of hardcoding "right" and -65.
 * Run with bun dev on :3000:  bun scripts/sim-platform-smoke.ts roarm_m2 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import artifact from "../public/botcortex/MANIFEST.json";
import { DEADLINES_MS } from "../lib/robot/browser-sim/host";

const platform = process.argv[2] ?? "roarm_m2";
const code = readFileSync(new URL("../../botcortex-runtime/tests/fixtures/portable_pick_and_place.py", import.meta.url), "utf8");

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/signin", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async ({ source, deadlines, platform }) => {
    const worker = new Worker("/sim-worker.js", { type: "module" });
    let nextId = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    worker.onmessage = ({ data }) => {
      if (!data.id) return;
      const waiter = pending.get(data.id);
      pending.delete(data.id);
      if (data.ok) waiter?.resolve(data.result); else waiter?.reject(new Error(data.error));
    };
    worker.onerror = (error) => { for (const waiter of pending.values()) waiter.reject(new Error(error.message)); };
    const ask = (request: { type: keyof typeof deadlines; [key: string]: unknown }) => new Promise<any>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { worker.terminate(); reject(new Error(`${request.type} timed out`)); }, deadlines[request.type]);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      worker.postMessage({ ...request, id });
    });
    try {
      const boot = await ask({ type: "boot", namespace: null, platform });
      await ask({ type: "beginTask" });
      const saved = await ask({ type: "callTool", name: "save_skill", args: { name: "portable_pick_and_place", code: source } });
      if (!saved.output.startsWith("saved ")) throw new Error(saved.output);
      const run = await ask({ type: "callTool", name: "run_skill", args: { name: "portable_pick_and_place", params_json: "{}" } });
      // A motion-only skill: the report must say what the ARM did, never
      // "NOTHING MOVED" — the wording that once convinced an agent a wave
      // it had just performed never happened.
      // The joint is whatever the BODY calls its second one: j2 on the
      // OpenArm and the Menagerie arms that number their joints, but
      // "shoulder_lift" on the SO-101 and "shoulder" on the ViperX. Naming
      // one here made this check a test of the OpenArm's vocabulary.
      const wave = `META = {"name": "wave_check", "description": "wave", "params": {}}
def run(ctx, **params):
    arm = ctx.arms[0]
    here = ctx.get_positions(arm)
    joint = [n for n in here if n != "gripper"][1]
    ctx.move_to(arm, {joint: here[joint] + 20.0})
    ctx.move_to(arm, {joint: here[joint]})
`;
      await ask({ type: "callTool", name: "save_skill", args: { name: "wave_check", code: wave } });
      const waved = await ask({ type: "callTool", name: "run_skill", args: { name: "wave_check", params_json: "{}" } });
      const contract = JSON.parse(boot.contract);
      return {
        version: contract.version,
        // The prompt must describe THIS body: its display name and its arm
        // names, never another body's "right" and "left".
        promptNamesBody: contract.system_prompt.includes(boot.displayName),
        promptArms: Object.keys(boot.state).every((arm: string) => contract.system_prompt.includes(`"${arm}"`)),
        platform: boot.platform,
        catalog: boot.catalog,
        bodies: boot.kinematics?.bodies?.length ?? 0,
        drive: Object.keys(boot.kinematics?.drive ?? {}),
        arms: Object.keys(boot.state),
        before: boot.scene.objects,
        tray: boot.scene.fixtures.tray_right.position,
        after: run.scene.objects,
        output: run.output,
        motionFrames: run.motion.length,
        waveOutput: waved.output,
      };
    } finally {
      worker.terminate();
    }
  }, { source: code, deadlines: DEADLINES_MS, platform });
  assert.equal(result.version, artifact.contractVersion);
  assert.equal(result.platform, platform, `booted ${result.platform}, asked for ${platform}`);
  assert(result.promptNamesBody && result.promptArms, "the agent contract does not describe the booted body");
  assert(result.output.startsWith("Rehearsed clean"), result.output);
  assert(result.motionFrames > 0, "successful task returned no motion");
  assert(/swept \S+ \d+°/.test(result.waveOutput) && !result.waveOutput.includes("NOTHING MOVED"), `wave reported: ${result.waveOutput}`);
  const red = result.after.red_block.position as number[];
  const tray = result.tray as number[];
  assert(Math.abs(red[0] - tray[0]) < 0.085 && Math.abs(red[1] - tray[1]) < 0.085 && red[2] > tray[2], `red ended at ${red}, tray at ${tray}`);
  console.log(JSON.stringify({ passed: `portable pick-and-place on ${platform} in the WASM runtime`, platform: result.platform, catalog: result.catalog, kinematicBodies: result.bodies, arms: result.arms, motionFrames: result.motionFrames, output: result.output }, null, 2));
} finally {
  await browser.close();
}
