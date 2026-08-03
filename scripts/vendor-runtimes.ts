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
