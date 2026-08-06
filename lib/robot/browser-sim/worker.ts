/**
 * The robot's own thread.
 *
 * Pyodide, MuJoCo and the runtime's package all live here. Booting them takes
 * about eight seconds of solid CPU — on the main thread that froze the tab
 * completely (measured: 73 of 79 timer ticks lost), so clicking "teach one
 * here" looked like nothing happening at all, right up until the robot
 * appeared.
 *
 * WHAT STOP CAN AND CANNOT DO HERE — stated precisely, because an earlier
 * version of this comment overstated it.
 *
 * `call_tool` is a synchronous Pyodide call, so a `{type:"stop"}` message
 * cannot be processed until the in-flight tool returns. The e-stop file is
 * therefore only written BETWEEN tool calls, not between motion frames the way
 * `wasm.py`'s loop checks it. A skill that loops for seconds runs to
 * completion inside the worker whatever the owner presses.
 *
 * What DOES happen immediately is the part an owner can see: the main thread
 * cuts playback on the very next frame, rewinds this worker to the pose that
 * was actually shown (`seek`), and the agent loop refuses to dispatch another
 * tool. So the arm stops where it was stopped, and nothing further is
 * attempted.
 *
 * Closing the remaining gap needs Pyodide's setInterruptBuffer, which needs a
 * SharedArrayBuffer and therefore COOP/COEP headers on the whole app. Worth
 * doing before anything here drives hardware; not worth it for a simulation
 * with no arm to hurt.
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
  | { id: number; type: "seek"; state: Record<string, Record<string, number>> }
  | {
      id: number;
      type: "logEpisode";
      task: string;
      skills: string[];
      outcome: "ok" | "fail";
      error?: string;
    }
  | { id: number; type: "beginTask" }
  | { id: number; type: "verify" }
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
  // Ask the PLATFORM which file to load, rather than naming one here. The
  // workcell (table, trays, blocks) lives in scene.xml and `<include>`s the
  // vendored arm; hardcoding the arm would silently give the browser a robot
  // with nothing to manipulate while the runtime had a full workcell.
  const [modelDir, worldFile]: [string, string] = JSON.parse(
    py.runPython(`
import json, pathlib
from botcortex import config
_world = config.PLATFORM.world_path
json.dumps([str(_world.parent), _world.name])
`),
  );
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
  const model = mj.MjModel.from_xml_path(`/model/${worldFile}`);

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
    // The workcell, split the way the protocol splits it: objects move and
    // ride the state stream, fixtures do not and go in the hello.
    scene: JSON.parse(py.runPython(`import json; json.dumps(session.robot.describe_scene())`)),
    skills: JSON.parse(py.runPython(`import json; json.dumps(session.store.names())`)),
    // Saved but never seen to run. The runtime's own hello carries this; a
    // browser that dropped it would list a failed teach's skill exactly like
    // one that works.
    unproven: JSON.parse(py.runPython(`import json; json.dumps(session.store.unproven())`)),
    stopped: py.runPython(`STOP_FILE.exists()`) as boolean,
    // Straight from the loaded platform, so the viewer never has to guess.
    gripper: JSON.parse(
      py.runPython(`
import json
from botcortex import config
_lo, _hi = config.JOINT_LIMITS[config.ARMS[0]]["gripper"]
json.dumps({
    "minDeg": _lo,
    "maxDeg": _hi,
    "travelM": float(config.PLATFORM.sim.get("gripper_meters_open", 0.044)),
})
`),
    ),
  };
}

/** Frames recorded by the last call, then cleared.
 *
 *  Joint frames zip with object frames one to one: both are appended per
 *  control tick and both are rewound by rehearsals, so the i-th step saw the
 *  i-th object pose. This is what lets playback carry a picked block WITH
 *  the arm instead of teleporting it to its destination first. */
function drainMotion() {
  return JSON.parse(
    py.runPython(`
import json
steps = [e for e in session.robot.motion_log if e[0] == "step"]
objects = list(session.robot.object_log)
session.robot.motion_log.clear()
session.robot.object_log.clear()
json.dumps([
    {
        "arm": arm,
        "positions": pos,
        "objects": objects[i] if i < len(objects) else None,
    }
    for i, (_, arm, pos) in enumerate(steps)
])
`),
  ) as Array<{
    arm: string;
    positions: Record<string, number>;
    objects: Record<string, number[]> | null;
  }>;
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
        // `output` is written for the MODEL — primitive counts, rehearsal
        // bookkeeping, how to approach an obstacle next time. `plain` is the
        // same event for the person watching, rewritten by the runtime's own
        // rule so the sidebar's Run button says what the robot's Run button
        // says.
        py.globals.set("tool_output", output);
        const plain = py.runPython(`
from botcortex.session import for_owner
for_owner(tool_output)
`) as string;
        // The motion goes back with the result so the main thread can play it;
        // the agent does not see the frames, only what the tool returned.
        result = { output, plain, motion: drainMotion(), ...snapshot() };
        break;
      }
      case "reset":
        py.runPython(`session.robot.reset()`);
        result = snapshot();
        break;
      case "seek":
        // STOP cut the playback short, so the arm the owner is looking at is
        // behind the one physics finished. Rewind physics to the displayed
        // pose, or the next move would plan its delta from a position that was
        // never shown and the e-stop would have "moved" the arm.
        py.globals.set("seek_state", py.toPy(request.state));
        py.runPython(`
for _arm, _joints in seek_state.items():
    for _joint, _deg in _joints.items():
        session.robot._write_target(_arm, _joint, _deg)
        session.robot._write_qpos(_arm, _joint, _deg)
for _i in range(len(session.robot.data.qvel)):
    session.robot.data.qvel[_i] = 0.0
js_mujoco.mj_forward(js_model, js_data)
`);
        result = snapshot();
        break;
      case "logEpisode":
        // The runtime writes one of these per teach (agent.py). Without it the
        // browser CALLS recall_episodes and never fills the store it reads —
        // half a loop, and the half that is missing is the one the product's
        // failure-memory claim rests on.
        py.globals.set("episode", py.toPy(request));
        py.runPython(`
session.memory.log(
    task=episode["task"],
    skills_used=list(episode.get("skills") or []),
    outcome=episode["outcome"],
    error=episode.get("error"),
)
`);
        result = true;
        break;
      case "beginTask":
        // A new task starts with no claims about it. Without this, a skill
        // saved during the LAST teach would count as evidence for this one.
        py.runPython(`session.forget_evidence()`);
        result = true;
        break;
      case "verify":
        // The runtime's own gate, asked across the worker boundary rather
        // than re-decided here — a browser that judged "done" by its own
        // rules would be a differently strict robot wearing the same name.
        result = JSON.parse(
          py.runPython(`import json; json.dumps(session.unverified())`),
        );
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
