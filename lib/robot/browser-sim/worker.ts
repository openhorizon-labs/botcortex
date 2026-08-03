/**
 * The robot's own thread.
 *
 * Pyodide, MuJoCo and the runtime's package all live here. Booting them takes
 * about eight seconds of solid CPU — on the main thread that froze the tab
 * completely (measured: 73 of 79 timer ticks lost), so clicking "teach one
 * here" looked like nothing happening at all, right up until the robot
 * appeared.
 *
 * Note what did NOT drive this decision. The plan worried that a worker could
 * not receive STOP while Python blocked inside `time.sleep` — true, and moot,
 * because the pacing decision removed the sleeping: a skill executes as fast as
 * the CPU allows (~100 ms) and the MAIN thread paces the playback. So the
 * worker is idle between tool calls, STOP lands within one call, and the tab
 * never stops responding.
 *
 * The protocol is request/response by id. Everything crossing the boundary is
 * plain JSON — no proxies, since Pyodide objects cannot be structured-cloned.
 */

/// <reference lib="webworker" />

const PYODIDE_URL = "/pyodide/";
const PYODIDE_ENTRY = "/pyodide/pyodide.mjs";
const MUJOCO_URL = "/mujoco/mujoco.js";
const WHEEL_URL = "/botcortex/botcortex-0.0.1-py3-none-any.whl";

export type WorkerRequest =
  | { id: number; type: "boot" }
  | { id: number; type: "callTool"; name: string; args: Record<string, unknown> }
  | { id: number; type: "reset" }
  | { id: number; type: "stop" }
  | { id: number; type: "resetStop" };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: "progress"; stage: string };

let py: any;
let mj: any;
let session: any;

const progress = (stage: string) => self.postMessage({ type: "progress", stage } as WorkerResponse);

async function boot() {
  progress("Starting Python");
  const { loadPyodide } = await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ PYODIDE_ENTRY
  );
  py = await loadPyodide({ indexURL: PYODIDE_URL });

  progress("Loading the robot runtime");
  const wheel = new Uint8Array(await (await fetch(WHEEL_URL)).arrayBuffer());
  py.FS.writeFile("/botcortex.whl", wheel);
  // Unzipped rather than micropip-installed: a wheel is a zip, the package is
  // pure Python, and micropip would fetch itself from a CDN and then try to
  // resolve fastapi/uvicorn — which the browser does not use and cannot
  // install (uvloop has no pure-Python wheel). Extracting also leaves real
  // files, which matters because the model assets and agent_contract.json are
  // read with pathlib.
  py.runPython(`
import sys, zipfile
zipfile.ZipFile("/botcortex.whl").extractall("/pkg")
sys.path.insert(0, "/pkg")
`);

  progress("Loading physics");
  const mujocoFactory = (
    await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ MUJOCO_URL)
  ).default;
  mj = await mujocoFactory();

  progress("Loading the arm");
  // The model rides in the same wheel as the code, so they cannot disagree.
  // The two WASM modules have separate filesystems, hence the copy.
  const modelDir: string = py.runPython(`
import pathlib, botcortex
str(pathlib.Path(botcortex.__file__).parent / "platforms" / "openarm_v1" / "model")
`);
  const assets: string[] = JSON.parse(
    py.runPython(`
import json, pathlib
json.dumps([str(p) for p in pathlib.Path("${modelDir}").rglob("*") if p.is_file()])
`),
  );
  mj.FS.mkdirTree("/model", 0o777);
  for (const path of assets) {
    const dest = `/model/${path.slice(modelDir.length + 1)}`;
    mj.FS.mkdirTree(dest.slice(0, dest.lastIndexOf("/")), 0o777);
    mj.FS.writeFile(dest, py.FS.readFile(path));
  }
  const model = mj.MjModel.from_xml_path("/model/openarm_bimanual.xml");

  progress("Waking the robot");
  py.globals.set("js_mujoco", mj);
  py.globals.set("js_model", model);
  py.globals.set("js_data", new mj.MjData(model));
  py.runPython(`
from pathlib import Path
from botcortex.memory import EpisodeMemory
from botcortex.session import RobotSession
from botcortex.skills import SkillStore
from botcortex.wasm import WasmRobot

Path("/data/skills").mkdir(parents=True, exist_ok=True)
STOP_FILE = Path("/data/STOP")
session = RobotSession(
    # realtime=False: the trajectory is identical either way, and the main
    # thread paces PLAYBACK instead — see host.ts.
    WasmRobot(js_mujoco, js_model, js_data, stop_file=STOP_FILE, realtime=False),
    store=SkillStore("/data/skills"),
    memory=EpisodeMemory("/data/episodes.jsonl"),
)
`);
  session = py.globals.get("session");

  return {
    // Read out of the installed wheel, never a copy in this repo.
    contract: py.runPython(`
import pathlib, botcortex
(pathlib.Path(botcortex.__file__).parent / "agent_contract.json").read_text()
`),
    ...snapshot(),
  };
}

/** Pose and skill list, as plain JSON. */
function snapshot() {
  return {
    state: JSON.parse(
      py.runPython(`
import json
json.dumps({arm: session.robot.get_positions(arm) for arm in ("right", "left")})
`),
    ),
    skills: JSON.parse(py.runPython(`import json; json.dumps(session.store.names())`)),
    stopped: py.runPython(`STOP_FILE.exists()`) as boolean,
  };
}

/** Frames recorded by the last call, then cleared. */
function drainMotion() {
  return JSON.parse(
    py.runPython(`
import json
log = [e for e in session.robot.motion_log if e[0] == "step"]
session.robot.motion_log.clear()
json.dumps([{"arm": arm, "positions": pos} for _, arm, pos in log])
`),
  ) as Array<{ arm: string; positions: Record<string, number> }>;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    let result: unknown;
    switch (request.type) {
      case "boot":
        result = await boot();
        break;
      case "callTool": {
        const output = String(session.call_tool(request.name, py.toPy(request.args)));
        // The motion goes back with the result so the main thread can play it;
        // the agent does not see the frames, only what the tool returned.
        result = { output, motion: drainMotion(), ...snapshot() };
        break;
      }
      case "reset":
        py.runPython(`session.robot.reset()`);
        result = snapshot();
        break;
      case "stop":
        py.runPython(`STOP_FILE.touch()`);
        result = true;
        break;
      case "resetStop":
        py.runPython(`STOP_FILE.unlink(missing_ok=True)`);
        result = true;
        break;
    }
    self.postMessage({ id: request.id, ok: true, result } as WorkerResponse);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } as WorkerResponse);
  }
};
