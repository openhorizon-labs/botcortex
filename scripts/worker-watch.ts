/**
 * Rebuild the sim worker when its source changes.
 *
 * `bun dev` builds public/sim-worker.js ONCE, at start (see vendor-runtimes.ts):
 * the worker is loaded by URL and is invisible to Next's hot reload, so an
 * edit to worker.ts during a dev session silently did nothing until the next
 * restart. Run this beside `bun dev`:
 *
 *   bun run worker:watch
 *
 * then disconnect/reconnect the in-browser simulator to pick up the new build.
 */
import { watch } from "node:fs";

const ENTRY = "lib/robot/browser-sim/worker.ts";
const DEBOUNCE_MS = 150;

async function build(): Promise<void> {
  const started = performance.now();
  // Identical to the build in scripts/vendor-runtimes.ts — the two runtimes
  // stay external and are fetched from our origin at run time.
  const built = await Bun.build({
    entrypoints: [ENTRY],
    outdir: "public",
    naming: "sim-worker.js",
    format: "esm",
    target: "browser",
    external: ["/pyodide/pyodide.mjs", "/mujoco/mujoco.js"],
  });
  const stamp = new Date().toLocaleTimeString();
  if (!built.success) {
    console.error(`[${stamp}] sim worker build FAILED\n${built.logs.join("\n")}`);
    return;
  }
  console.log(`[${stamp}] built public/sim-worker.js in ${Math.round(performance.now() - started)} ms`);
}

await build();
console.log(`watching ${ENTRY} — reconnect the browser simulator after each rebuild`);

let timer: ReturnType<typeof setTimeout> | null = null;
watch(ENTRY, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void build();
  }, DEBOUNCE_MS);
});
