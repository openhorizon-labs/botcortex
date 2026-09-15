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

import runtimeArtifact from "@/public/botcortex/MANIFEST.json";

const PYODIDE_URL = "/pyodide/";
const PYODIDE_ENTRY = "/pyodide/pyodide.mjs";
const MUJOCO_URL = "/mujoco/mujoco.js";
const WHEEL_URL = `/botcortex/${runtimeArtifact.wheel}`;

export type WorkerRequest =
  /** `namespace` is the signed-in account's id, or null for a session-only
   *  robot. Skills and episodes are mounted from IndexedDB under it, so two
   *  accounts on one browser never read each other's files. */
  | {
      id: number;
      type: "boot";
      namespace: string | null;
      /** Which body to simulate — a name from the runtime's catalog. Null
       *  or unknown boots the default (openarm_v1); the hello names the
       *  catalog so the picker only offers what this wheel can load. */
      platform?: string | null;
    }
  | { id: number; type: "callTool"; name: string; args: Record<string, unknown> }
  | { id: number; type: "reset" }
  | {
      id: number;
      type: "seek";
      state: Record<string, Record<string, number>>;
      /** Where every object was DRAWN when STOP landed: [x, y, z, qw, qx,
       *  qy, qz] per name. Restored with the arm, or the next tool would plan
       *  around a block that physics had already carried somewhere else. */
      objects?: Record<string, number[]>;
    }
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

/** Where the robot's files live. MEMFS by default; IDBFS when an account
 *  namespace is mounted over it. The STOP latch deliberately lives OUTSIDE
 *  this tree: a stop file that persisted would latch the NEXT session's
 *  robot from a stop nobody pressed, and restoring storage must never
 *  inherit another robot's latch. */
const DATA_ROOT = "/data";
const STOP_PATH = "/run/STOP";
/** Whether `/data` is backed by IndexedDB. */
let durable = false;

const progress = (stage: string) => self.postMessage({ type: "progress", stage } as WorkerResponse);

/** Flush IDBFS → IndexedDB, or MEMFS → nothing. Returns why it failed. */
async function flush(): Promise<{ flushed: boolean; error?: string }> {
  if (!durable) return { flushed: false, error: "session only" };
  try {
    await new Promise<void>((resolve, reject) =>
      py.FS.syncfs(false, (error: unknown) => (error ? reject(error) : resolve())),
    );
    return { flushed: true };
  } catch (error) {
    return { flushed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Mount the account's files before anything reads them.
 *
 * Pyodide's default filesystem is MEMFS — gone on reload (see the audit's
 * B02 and Pyodide's own docs). IDBFS keeps a copy in IndexedDB per mount
 * point, and the mount point is the account namespace, so account B mounts a
 * different store from account A. Hydration is awaited: constructing the
 * session over an empty directory and syncing afterwards would let the first
 * `list_skills` report a robot that knows nothing.
 */
async function mountMemory(namespace: string | null) {
  py.FS.mkdirTree(DATA_ROOT);
  py.FS.mkdirTree("/run");
  if (!namespace) return;
  // A path segment, never raw: an id with a slash would mount somewhere else.
  const safe = encodeURIComponent(namespace);
  const mount = `${DATA_ROOT}/${safe}`;
  py.FS.mkdirTree(mount);
  try {
    py.FS.mount(py.FS.filesystems.IDBFS, {}, mount);
    await new Promise<void>((resolve, reject) =>
      py.FS.syncfs(true, (error: unknown) => (error ? reject(error) : resolve())),
    );
    durable = true;
  } catch (error) {
    // Private browsing, a blocked IndexedDB, a quota problem: the robot
    // still boots, session-only, and the hello says so.
    durable = false;
    throw error;
  }
}

async function boot(namespace: string | null, platform: string | null = null) {
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
  // Which body. The runtime reads BOTCORTEX_PLATFORM once, when its config
  // module is first imported, so the choice has to land before anything
  // below touches botcortex.config. Only bodies whose model ships in the
  // wheel and parses in WASM are offered; anything else is the default.
  py.globals.set("wanted_platform", platform);
  const [modelDir, worldFile, catalogJson]: [string, string, string] = JSON.parse(
    py.runPython(`
import json, os
from botcortex.platform import available_platforms, load_platform
_catalog = [
    {"name": p.name, "displayName": p.display_name}
    for p in (load_platform(n) for n in available_platforms())
    if p.browser_capable and p.model_available
]
_names = {c["name"] for c in _catalog}
os.environ["BOTCORTEX_PLATFORM"] = wanted_platform if wanted_platform in _names else "openarm_v1"
from botcortex import config
_world = config.PLATFORM.world_path
json.dumps([str(_world.parent), _world.name, json.dumps(_catalog)])
`),
  );
  // The model rides in the same wheel as the code, so they cannot disagree.
  // The two WASM modules have separate filesystems, hence the copy.
  // Ask the PLATFORM which file to load, rather than naming one here. The
  // workcell (table, trays, blocks) lives in scene.xml and `<include>`s the
  // vendored arm; hardcoding the arm would silently give the browser a robot
  // with nothing to manipulate while the runtime had a full workcell.
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

  progress("Opening the robot's memory");
  let memoryError: string | undefined;
  try {
    await mountMemory(namespace);
  } catch (error) {
    memoryError = error instanceof Error ? error.message : String(error);
  }
  // Skills are written for a body: one that reads ctx.arms may run on the
  // next robot, one that hardcodes "right" will not, and an agent shown a
  // skill it cannot run wastes its first attempt on it. So each body keeps
  // its own skills. The default body keeps the pre-existing location, so
  // nobody's OpenArm skills move; other bodies live beside it.
  const accountDir = namespace ? `${DATA_ROOT}/${encodeURIComponent(namespace)}` : DATA_ROOT;
  const bootedPlatform = py.runPython(`config.PLATFORM.name`) as string;
  const dataDir = bootedPlatform === "openarm_v1" ? accountDir : `${accountDir}/bodies/${bootedPlatform}`;

  progress("Waking the robot");
  py.globals.set("js_mujoco", mj);
  py.globals.set("js_model", model);
  py.globals.set("js_data", new mj.MjData(model));
  py.globals.set("data_dir", dataDir);
  py.globals.set("stop_path", STOP_PATH);
  py.runPython(`
from pathlib import Path
from botcortex.memory import EpisodeMemory
from botcortex.session import RobotSession
from botcortex.skills import SkillStore
from botcortex.wasm import WasmRobot

_data = Path(data_dir)
(_data / "skills").mkdir(parents=True, exist_ok=True)
STOP_FILE = Path(stop_path)
STOP_FILE.parent.mkdir(parents=True, exist_ok=True)
session = RobotSession(
    # realtime=False: the trajectory is identical either way, and the main
    # thread paces PLAYBACK instead — see host.ts.
    WasmRobot(js_mujoco, js_model, js_data, stop_file=STOP_FILE, realtime=False),
    store=SkillStore(_data / "skills"),
    memory=EpisodeMemory(_data / "episodes.jsonl"),
)
`);
  session = py.globals.get("session");

  return {
    // The wheel ships one contract per browser-capable body (exported at
    // release, botcortex/agent_contracts/<body>.json): the prompt and tool
    // descriptions name THAT body's arms, joints and gripper degrees. Read
    // for the body that booted; the default file is the fallback. Never a
    // copy in this repo, and never built here — the builder needs the
    // Anthropic SDK, which the browser does not carry.
    contract: py.runPython(`
import pathlib, botcortex
_root = pathlib.Path(botcortex.__file__).parent
_own = _root / "agent_contracts" / (config.PLATFORM.name + ".json")
(_own if _own.exists() else _root / "agent_contract.json").read_text()
`),
    memory: { durable, error: memoryError },
    platform: bootedPlatform,
    displayName: py.runPython(`config.PLATFORM.display_name`) as string,
    catalog: JSON.parse(catalogJson),
    kinematics: kinematics(),
    kinematicsError,
    ...snapshot(),
  };
}

/**
 * The robot's kinematic tree and primitive geometry, straight from the loaded
 * MuJoCo model, for a viewer that has no URDF for this body.
 *
 * Bodies come in MuJoCo's order (parents first) with their pose in the
 * parent's frame, their joints (axis and anchor in the body frame), and their
 * primitive geoms — meshes are skipped, which is why the OpenArm keeps its
 * URDF path. `drive` says how each runtime joint (degrees, per arm) reaches
 * each model joint's qpos: q = a * deg + b, measured off JointMap rather than
 * re-derived here, so the browser cannot disagree with the runtime about
 * which way a jaw closes. Null when this WASM build does not expose the
 * fields, and the viewer then says so instead of drawing a guess.
 */
function kinematics(): unknown {
  try {
    return JSON.parse(
      py.runPython(`
import json
from botcortex import config, mjcompat, scene

_mj, _model = js_mujoco, js_model
def _name(kind, i):
    return _mj.mj_id2name(_model, mjcompat.enum_value(getattr(_mj.mjtObj, kind)), i) or ""
_robot = scene.robot_bodies(_mj, _model, config.PLATFORM.sim)
_nbody = int(_model.nbody)
_body_names = {i: _name("mjOBJ_BODY", i) for i in range(_nbody)}
_joints_by_body, _qpos_joint = {}, {}
for j in range(int(_model.njnt)):
    _b, _t = int(_model.jnt_bodyid[j]), int(_model.jnt_type[j])
    _entry = {
        "name": _name("mjOBJ_JOINT", j),
        "type": {2: "slide", 3: "hinge"}.get(_t, "other"),
        "axis": mjcompat.row(_model.jnt_axis, j, 3),
        "pos": mjcompat.row(_model.jnt_pos, j, 3),
    }
    _joints_by_body.setdefault(_b, []).append(_entry)
    _qpos_joint[int(_model.jnt_qposadr[j])] = _entry["name"]
def _span(array, start, stop):
    # A native numpy row slices; the WASM build's typed-array views do not
    # ("Slice subscripting isn't implemented for typed arrays"), but they
    # expose subarray(). Ask for that first, fall back to indexing.
    try:
        return list(array.subarray(start, stop).to_py())
    except Exception:
        try:
            return list(array[start:stop])
        except Exception:
            return [array[i] for i in range(start, stop)]
_GEOM = {2: "sphere", 3: "capsule", 5: "cylinder", 6: "box", 7: "mesh"}
_geoms_by_body, _meshes = {}, {}
for g in range(int(_model.ngeom)):
    _b, _t = int(_model.geom_bodyid[g]), int(_model.geom_type[g])
    if _t not in _GEOM:
        continue
    # Visual-only geoms (contype 0, conaffinity 0) are the model's drawing of
    # itself; collision primitives that ALSO carry group 3 are physics-only
    # and stay out of the picture, as MuJoCo's own viewer hides them.
    if int(_model.geom_group[g]) == 3:
        continue
    _mat = int(_model.geom_matid[g])
    _rgba = mjcompat.row(_model.mat_rgba, _mat, 4) if _mat >= 0 else mjcompat.row(_model.geom_rgba, g, 4)
    _entry = {
        "type": _GEOM[_t],
        "size": mjcompat.row(_model.geom_size, g, 3),
        "pos": mjcompat.row(_model.geom_pos, g, 3),
        "quat": mjcompat.row(_model.geom_quat, g, 4),
        "rgba": _rgba,
    }
    if _t == 7:
        # The COMPILED mesh — re-centred exactly as the geom's pos/quat
        # expect — as flat vertex and face arrays, so the drawing is the
        # mesh physics sees and not the file it came from.
        _mid = int(_model.geom_dataid[g])
        _mname = _name("mjOBJ_MESH", _mid)
        _entry["mesh"] = _mname
        if _mname not in _meshes:
            _va, _vn = int(_model.mesh_vertadr[_mid]), int(_model.mesh_vertnum[_mid])
            _fa, _fn = int(_model.mesh_faceadr[_mid]), int(_model.mesh_facenum[_mid])
            _meshes[_mname] = {
                "vertices": [round(float(v), 5) for v in _span(_model.mesh_vert, _va * 3, (_va + _vn) * 3)],
                "faces": [int(v) for v in _span(_model.mesh_face, _fa * 3, (_fa + _fn) * 3)],
            }
    _geoms_by_body.setdefault(_b, []).append(_entry)
_bodies = []
for i in range(1, _nbody):
    _n = _body_names[i]
    if _n not in _robot:
        continue
    _bodies.append({
        "name": _n,
        "parent": _body_names[int(_model.body_parentid[i])],
        "pos": mjcompat.row(_model.body_pos, i, 3),
        "quat": mjcompat.row(_model.body_quat, i, 4),
        "joints": _joints_by_body.get(i, []),
        "geoms": _geoms_by_body.get(i, []),
    })
_jm = session.robot.joints
_drive = {}
for _arm in config.ARMS:
    _drive[_arm] = {}
    for _joint in config.JOINT_LIMITS[_arm]:
        _w0, _w1 = _jm.qpos_writes(_arm, _joint, 0.0), _jm.qpos_writes(_arm, _joint, 10.0)
        _drive[_arm][_joint] = [
            {"joint": _qpos_joint.get(_i0, ""), "a": (_v1 - _v0) / 10.0, "b": _v0}
            for (_i0, _v0), (_i1, _v1) in zip(_w0, _w1)
        ]
json.dumps({"bodies": _bodies, "drive": _drive, "meshes": _meshes})
`),
    );
  } catch (error) {
    // Surfaced in the boot result rather than only logged: a worker's
    // console is easy to lose, and "no 3D model" with no reason is a guess.
    kinematicsError = error instanceof Error ? error.message : String(error);
    console.warn("[botcortex] no kinematic tree from this build", kinematicsError);
    return null;
  }
}

let kinematicsError: string | null = null;

/** Tools whose side effects live in /data and must reach IndexedDB. */
const PERSISTING_TOOLS = new Set(["save_skill", "run_skill", "log_lesson"]);

/** Pose and skill list, as plain JSON. */
function snapshot() {
  return {
    state: JSON.parse(
      py.runPython(`
import json
json.dumps({arm: session.robot.get_positions(arm) for arm in config.ARMS})
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
        result = await boot(request.namespace, request.platform ?? null);
        break;
      case "callTool": {
        const output = String(session.call_tool(request.name, py.toPy(request.args)));
        // Flushed BEFORE the reply, so "saved" on screen means saved in
        // IndexedDB — and a flush that fails rides back with the reply
        // rather than being discovered on the next reload.
        const memory = PERSISTING_TOOLS.has(request.name) ? await flush() : null;
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
        result = { output, plain, motion: drainMotion(), memory, ...snapshot() };
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
        // The objects too (audit B05): a stopped carry left the block where
        // physics had finished while the owner looked at it mid-air, and the
        // next move planned around the wrong scene. `place_objects` is the
        // runtime's own reset path; a public snapshot API in the wheel is
        // still the right long-term home for all of this.
        py.globals.set("seek_state", py.toPy(request.state));
        py.globals.set("seek_objects", py.toPy(request.objects ?? {}));
        py.runPython(`
from botcortex import scene as _scene
for _arm, _joints in seek_state.items():
    for _joint, _deg in _joints.items():
        session.robot._write_target(_arm, _joint, _deg)
        session.robot._write_qpos(_arm, _joint, _deg)
_known = {k: list(v) for k, v in seek_objects.items() if k in session.robot._object_addr and len(v) == 7}
if _known:
    _scene.place_objects(session.robot.data.qpos, session.robot._object_addr, _known)
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
        result = await flush();
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
