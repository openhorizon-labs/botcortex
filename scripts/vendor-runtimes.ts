/**
 * Copy the browser sim's WASM runtimes out of node_modules into public/.
 *
 * Run as part of `build`, not committed: Pyodide and MuJoCo are 23 MB of
 * binaries that npm already versions for us, and putting them in git would
 * bloat the repo permanently for no gain.
 *
 * Self-hosted rather than CDN-loaded, though. The sim is the first thing a new
 * account touches, and making that depend on jsdelivr being reachable turns
 * our onboarding into someone else's uptime.
 *
 * The botcortex WHEEL is the exception and IS committed — see
 * public/botcortex/. It comes from another repo, it is the anti-drift artifact
 * the whole browser sim rests on, and a build must not be able to pick up a
 * different one than was tested.
 *
 * This also BUILDS the sim worker to public/sim-worker.js rather than letting
 * the app bundler emit it. Turbopack produces a CLASSIC worker even when asked
 * for `{ type: "module" }`, and Pyodide refuses to run in one ("Classic web
 * workers are not supported"). Emitting a real ES module here and loading it
 * by URL sidesteps the bundler entirely — the same treatment Pyodide and
 * MuJoCo already get, and for the same reason.
 */
import { copyFileSync, mkdirSync } from "node:fs";

const COPIES: Array<[string, string, string[]]> = [
  [
    "node_modules/pyodide",
    "public/pyodide",
    [
      "pyodide.mjs",
      "pyodide.asm.mjs",
      "pyodide.asm.wasm",
      "python_stdlib.zip",
      "pyodide-lock.json",
    ],
  ],
  ["node_modules/@mujoco/mujoco", "public/mujoco", ["mujoco.js", "mujoco.wasm"]],
];

for (const [from, to, files] of COPIES) {
  mkdirSync(to, { recursive: true });
  for (const file of files) copyFileSync(`${from}/${file}`, `${to}/${file}`);
  console.log(`vendored ${files.length} files -> ${to}`);
}

// The worker is real ESM, with the two runtimes left external: they are loaded
// from our origin at run time and must not be pulled into the bundle.
const built = await Bun.build({
  entrypoints: ["lib/robot/browser-sim/worker.ts"],
  outdir: "public",
  naming: "sim-worker.js",
  format: "esm",
  target: "browser",
  external: ["/pyodide/pyodide.mjs", "/mujoco/mujoco.js"],
});
if (!built.success) {
  console.error(built.logs.join("\n"));
  throw new Error("sim worker build failed");
}
console.log("built public/sim-worker.js");
