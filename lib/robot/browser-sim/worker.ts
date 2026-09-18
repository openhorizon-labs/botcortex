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

/** One registry row, as GET /api/skills returns it. */
export type RegistrySkill = {
  name: string;
  description: string;
  code: string;
  proven: boolean;
  /** Milliseconds since the epoch. */
  updatedAt: number;
};

/** A local skill the registry should have and does not (or has an older
 *  copy of), handed back so the main thread can push it up. */
export type LocalSkill = { name: string; description: string; code: string; proven: boolean };

export type ImportReport = {
  /** Written into the local store from the registry. */
  restored: string[];
  /** Local copy kept — same code, or newer than the registry's. */
  kept: string[];
  /** Registry rows the store refused (name → why), so a corrupt row can
   *  never take the whole boot down. */
  rejected: [string, string][];
  /** Skills the registry is missing or behind on, for the push-up. */
  push: LocalSkill[];
};
const WHEEL_URL = `/botcortex/${runtimeArtifact.wheel}`;
/** Bodies whose geometry does NOT ride in the wheel.
 *
 *  A Menagerie arm is tens of megabytes of mesh; putting the Panda's 34 MB
 *  into a package every visitor downloads to boot a RoArm would be absurd.
 *  Each is packed instead into its own zip (see the runtime's
 *  scripts/bundle_model.py) and fetched ONLY when someone boots that body.
 *  The manifest names them so this file never hardcodes a body list. */
const MODEL_BUNDLES: Record<string, { zip: string }> = Object.fromEntries(
  (runtimeArtifact.models ?? []).map((m) => [m.platform, { zip: m.zip }]),
);

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
      /** One shared integer, 1 while STOP is pressed — see `stopFlag`. Absent
       *  when the page is not cross-origin isolated. */
      stopFlag?: SharedArrayBuffer;
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
  | { id: number; type: "beginTask"; task?: string }
  /** The account registry's copy of this body's skills, read at boot.
   *  Rebuilds the local store from it (see `importSkills`). */
  | { id: number; type: "importSkills"; skills: RegistrySkill[] }
  | { id: number; type: "verify" }
  | { id: number; type: "stop" }
  | { id: number; type: "resetStop" };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: "progress"; stage: string }
  /** The robot is still computing. `label` names the step being rehearsed when
   *  there is one; without it this is only a pulse. See host.ts LIVENESS. */
  | { type: "working"; label?: string; step?: number }
  /** A run, kept as training data (wheel 0.0.23+, botcortex/episodes.py): an
   *  episode, a tag on one, or a link from a success to the failures it
   *  repaired. JSON text, so nothing of Pyodide's crosses the boundary. A tab
   *  has no disk, so the page is the only place these can go. */
  | { type: "episode"; event: string };

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

/**
 * A whole grid of pose-search probes in one call.
 *
 * A pose search asks "where would the hand be at these joint angles?" 58,564
 * times, and from Python each ask is several crossings into MuJoCo: measured,
 * 1.2 s per search, twenty searches in a two-block skill, and that — not
 * physics — was the still robot an owner watched before anything moved.
 *
 * This is NOT a second definition of the robot. The runtime still decides
 * every number that means something: which address each joint lives at and
 * what its angle is in MuJoCo's units, where the jaws close in the hand frame,
 * which way is down (botcortex/posesearch.py, _probe_many). What is left is
 * enumerating the product, first axis outermost — the order kinematics._grid
 * uses — and one expression, written to match Python bit for bit:
 * tests/test_posesearch.py in the runtime holds a line-for-line twin of this
 * function and proves it finds exactly what the one-at-a-time search finds, on
 * every body.
 */
function probeBatch(mujoco: any, model: any, data: any) {
  const list = (value: any): number[] => (value?.toJs ? value.toJs() : value);
  /** sum() of floats as CPython 3.12+ computes it: Neumaier compensated. A
   *  plain a+b+c was one unit in the last place out on the RoArm. */
  const pythonSum = (a: number, b: number, c: number) => {
    let total = 0;
    let carry = 0;
    for (const x of [a, b, c]) {
      const t = total + x;
      carry += Math.abs(total) >= Math.abs(x) ? total - t + x : x - t + total;
      total = t;
    }
    return carry !== 0 && Number.isFinite(carry) ? total + carry : total;
  };
  return (
    heldAdr: any, heldVal: any, axisAdr: any, axisVal: any, axisLen: any,
    hand: number, offsetIn: any, downIndex: number, sign: number,
  ) => {
    const [hAdr, hVal, aAdr, aVal, aLen, offset] = [heldAdr, heldVal, axisAdr, axisVal, axisLen, offsetIn].map(list);
    // Views onto the WASM heap: a fresh one per property access, so taken once.
    const qpos = data.qpos as Float64Array;
    hAdr.forEach((adr, i) => { qpos[adr] = hVal[i]; });
    const starts = aLen.map((_, j) => aLen.slice(0, j).reduce((sum, n) => sum + n, 0));
    const total = aLen.reduce((product, n) => product * n, 1);
    const out = new Float64Array(total * 4);
    const index = new Array<number>(aLen.length).fill(0);
    const base = hand * 3;
    const rotBase = hand * 9;
    for (let n = 0; n < total; n += 1) {
      for (let j = 0; j < aLen.length; j += 1) qpos[aAdr[j]] = aVal[starts[j] + index[j]];
      mujoco.mj_kinematics(model, data);
      const xpos = data.xpos as Float64Array;
      const xmat = data.xmat as Float64Array;
      for (let r = 0; r < 3; r += 1) {
        const row = rotBase + r * 3;
        out[n * 4 + r] = xpos[base + r] + pythonSum(xmat[row] * offset[0], xmat[row + 1] * offset[1], xmat[row + 2] * offset[2]);
      }
      out[n * 4 + 3] = sign * xmat[rotBase + downIndex];
      // Odometer, last axis fastest: kinematics._grid's order.
      for (let j = aLen.length - 1; j >= 0; j -= 1) {
        index[j] += 1;
        if (index[j] < aLen[j]) break;
        index[j] = 0;
      }
    }
    return out;
  };
}

const progress = (stage: string) => self.postMessage({ type: "progress", stage } as WorkerResponse);
/** Posted from INSIDE a synchronous Python call — a worker's postMessage does
 *  not wait for the call to return, which is the whole reason this works. */
const working = (label?: string, step?: number) => {
  pressStopIfAsked();
  self.postMessage({ type: "working", label, step } as WorkerResponse);
};

/**
 * STOP, reaching a skill that is still computing.
 *
 * A `{type:"stop"}` message waits in the queue until the synchronous Python
 * call returns — which, for a skill, is after the whole thing has been
 * computed. This flag does not wait: the main thread sets it, and the runtime's
 * own pulse (twice a second, from inside the motion loop) lands here and sees
 * it. What happens next is deliberately nothing new: the STOP FILE is written,
 * and the runtime's one e-stop check — `stop_file.exists()`, before every
 * control tick, the same line on every backend — does the stopping.
 */
let stopFlag: Int32Array | null = null;
function pressStopIfAsked() {
  if (!stopFlag || Atomics.load(stopFlag, 0) !== 1 || !py) return;
  try {
    py.FS.writeFile(STOP_PATH, "");
  } catch {
    /* the message-driven stop still lands when the tool returns */
  }
}

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

/**
 * Fetch something the sim cannot boot without, and fail with a sentence a
 * person can act on.
 *
 * A tab open across a deploy is the case this exists for. The wheel and the
 * mesh bundles are named by version, so an old worker asks for a file that is
 * no longer there, gets the 404 page, and hands Python an HTML document to
 * unzip — which fails as `BadZipFile: File is not a zip file`, a message that
 * reads like a corrupt download and sends you looking in the wrong place. It
 * cost me an hour. The fix is not to make the file eternal; it is to say what
 * actually happened.
 */
async function required(url: string, what: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`Could not download ${what} (${url}): ${cause instanceof Error ? cause.message : cause}`);
  }
  if (!response.ok) {
    throw new Error(
      `Could not download ${what}: ${url} returned ${response.status}. ` +
        `This tab is running an older version of the app than the server. Reload the page.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Every artifact here is a zip, and every zip starts "PK".
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error(
      `${url} did not return ${what} — the first bytes are not a zip. ` +
        `This tab is probably running an older version of the app than the server. Reload the page.`,
    );
  }
  return bytes;
}

async function boot(namespace: string | null, platform: string | null = null) {
  progress("Starting Python");
  const { loadPyodide } = await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ PYODIDE_ENTRY
  );
  py = await loadPyodide({ indexURL: PYODIDE_URL });

  progress("Loading the robot runtime");
  py.FS.writeFile("/botcortex.whl", await required(WHEEL_URL, "the robot runtime"));
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
  // A Menagerie body's meshes arrive now, before anything asks the runtime
  // whether its model is available — `Platform.model_available` is a file
  // existence check, so an un-fetched body would be judged unbootable and
  // silently swapped for the default.
  const bundle = platform ? MODEL_BUNDLES[platform] : undefined;
  if (bundle) {
    progress("Fetching the arm's meshes");
    py.globals.set("bundle_platform", platform);
    const modelDir = py.runPython(`
from botcortex.platform import load_platform
str(load_platform(bundle_platform).model_dir)
`) as string;
    py.FS.writeFile(
      "/model.zip",
      await required(`/botcortex/models/${bundle.zip}`, `the ${platform} meshes`),
    );
    py.globals.set("model_dir", modelDir);
    py.runPython(`
import pathlib, zipfile
pathlib.Path(model_dir).mkdir(parents=True, exist_ok=True)
zipfile.ZipFile("/model.zip").extractall(model_dir)
`);
  }

  // Which body. The runtime reads BOTCORTEX_PLATFORM once, when its config
  // module is first imported, so the choice has to land before anything
  // below touches botcortex.config. Only bodies whose model ships in the
  // wheel and parses in WASM are offered; anything else is the default.
  py.globals.set("wanted_platform", platform);
  py.globals.set("bundled_platforms", Object.keys(MODEL_BUNDLES));
  const [modelDir, worldFile, catalogJson]: [string, string, string] = JSON.parse(
    py.runPython(`
import json, os
from botcortex.platform import available_platforms, load_platform
_catalog = [
    {"name": p.name, "displayName": p.display_name}
    for p in (load_platform(n) for n in available_platforms())
    if p.browser_capable and (p.model_available or p.name in set(bundled_platforms))
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
  const data = new mj.MjData(model);
  py.globals.set("js_data", data);
  py.globals.set("js_probe_batch", probeBatch(mj, model, data));
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
  // The runtime says what it is rehearsing and that it is still alive (wheel
  // 0.0.17+). An older wheel has neither attribute's caller, so this is inert.
  py.globals.set("js_working", (label?: string, step?: number) => working(label ?? undefined, step ?? undefined));
  py.runPython(`
def _forward(event):
    if event.get("type") == "working":
        js_working(event.get("label"), event.get("step"))
session.emit = _forward
session.robot.on_alive = lambda: js_working(None, None)
# Wheel 0.0.18+: the pose search hands its whole grid over in one call.
session.robot.probe_batch = js_probe_batch
`);
  // Wheel 0.0.23+: every run is handed over as it ends. States only — a tab
  // has no camera, and in simulation the pixels are a function of the states
  // (the runtime renders them later). An older wheel has no such module.
  py.globals.set("js_episode", (event: string) => self.postMessage({ type: "episode", event } as WorkerResponse));
  py.runPython(`
try:
    import json as _json
    from botcortex import episodes as _episodes
    session.robot.recorder = _episodes.Recorder(None, sink=lambda event: js_episode(_json.dumps(event)))
except ImportError:
    pass
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
 * geoms. Meshes come too, as the COMPILED vertex and face arrays rather than
 * a file reference, so the viewer draws what physics actually loaded; the
 * OpenArm keeps its URDF path because its decimated GLBs carry material
 * colours these arrays do not. `drive` says how each runtime joint (degrees, per arm) reaches
 * each model joint's qpos: q = a * deg + b, measured off JointMap rather than
 * re-derived here, so the browser cannot disagree with the runtime about
 * which way a jaw closes. Null when this WASM build does not expose the
 * fields, and the viewer then says so instead of drawing a guess.
 */
function kinematics(): { meshBuffer?: ArrayBuffer } | null {
  try {
    const described = JSON.parse(
      py.runPython(`
import array, json
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
#: Every mesh's vertices then faces, back to back. Offsets above index it.
_blob = bytearray()
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
        # expect — so the drawing is the mesh physics sees and not the file it
        # came from. Packed into one binary blob rather than written out as
        # JSON numbers: the Panda's visual meshes are 1.6 million of them, and
        # as text that was a 12 MB string to build in Python, parse in JS and
        # structured-clone to the main thread on every boot. As float32 and
        # uint32 it is a third of that and moves by transfer, without a parse.
        _mid = int(_model.geom_dataid[g])
        _mname = _name("mjOBJ_MESH", _mid)
        _entry["mesh"] = _mname
        if _mname not in _meshes:
            _va, _vn = int(_model.mesh_vertadr[_mid]), int(_model.mesh_vertnum[_mid])
            _fa, _fn = int(_model.mesh_faceadr[_mid]), int(_model.mesh_facenum[_mid])
            _verts = array.array("f", (float(v) for v in _span(_model.mesh_vert, _va * 3, (_va + _vn) * 3)))
            _faces = array.array("I", (int(v) for v in _span(_model.mesh_face, _fa * 3, (_fa + _fn) * 3)))
            _meshes[_mname] = {
                "vertexOffset": len(_blob),
                "vertexCount": len(_verts),
                "faceOffset": len(_blob) + _verts.itemsize * len(_verts),
                "faceCount": len(_faces),
            }
            _blob.extend(_verts.tobytes())
            _blob.extend(_faces.tobytes())
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
mesh_blob = bytes(_blob)
json.dumps({"bodies": _bodies, "drive": _drive, "meshes": _meshes})
`),
    );
    // The blob comes across as its own object, never inside the JSON: bytes
    // in JSON means base64, which is a third bigger than the binary it hides.
    const blob = py.globals.get("mesh_blob") as { toJs?: () => Uint8Array } | null;
    const bytes = blob && typeof blob.toJs === "function" ? blob.toJs() : null;
    if (bytes && bytes.byteLength) {
      described.meshBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
    }
    return described;
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
        stopFlag = request.stopFlag ? new Int32Array(request.stopFlag) : null;
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
      case "importSkills": {
        // The registry copy is the one that outlives this browser, so at
        // boot it fills whatever the local store lacks. Where both have a
        // skill, the newer copy wins: a local file written after the row
        // (a save whose sync failed) is kept and pushed up, anything else
        // takes the registry's code. The proof mark travels with the code.
        py.globals.set("remote_skills", py.toPy(request.skills));
        const report = JSON.parse(
          py.runPython(`
import json
from botcortex.skills import SkillError
_remote = {s["name"]: s for s in remote_skills}
_report = {"restored": [], "kept": [], "rejected": [], "push": []}
_metas = {m["name"]: m for m in session.store.list()}
for _name, _s in _remote.items():
    _path = session.store.directory / f"{_name}.py"
    if _path.exists():
        _local = _path.read_text()
        if _local == _s["code"]:
            if _s["proven"] and not session.store.has_run(_name):
                session.store.mark_ran(_name)
            _report["kept"].append(_name)
            if session.store.has_run(_name) and not _s["proven"]:
                _report["push"].append({"name": _name, "description": _metas.get(_name, {}).get("description", ""), "code": _local, "proven": True})
            continue
        if _path.stat().st_mtime * 1000 > _s["updatedAt"]:
            _report["kept"].append(_name)
            _report["push"].append({"name": _name, "description": _metas.get(_name, {}).get("description", ""), "code": _local, "proven": session.store.has_run(_name)})
            continue
    try:
        session.store.save(_name, _s["code"])
    except SkillError as e:
        _report["rejected"].append([_name, str(e)])
        continue
    if _s["proven"]:
        session.store.mark_ran(_name)
    _report["restored"].append(_name)
for _m in session.store.list():
    if _m["name"] not in _remote:
        _report["push"].append({"name": _m["name"], "description": _m["description"], "code": (session.store.directory / f"{_m['name']}.py").read_text(), "proven": session.store.has_run(_m["name"])})
json.dumps(_report)
`),
        ) as ImportReport;
        result = { ...report, memory: report.restored.length ? await flush() : null, ...snapshot() };
        break;
      }
      case "beginTask":
        // A new task starts with no claims about it. Without this, a skill
        // saved during the LAST teach would count as evidence for this one.
        py.globals.set("task_text", request.task ?? null);
        // `task` is what the episode record calls the instruction; an older
        // wheel's session simply gains an attribute nothing reads.
        py.runPython(`session.forget_evidence()\nsession.task = task_text`);
        result = true;
        break;
      case "verify":
        // The runtime's own gate, asked across the worker boundary rather
        // than re-decided here — a browser that judged "done" by its own
        // rules would be a differently strict robot wearing the same name.
        // A gate that lets the task stand is also the moment the skills the
        // agent ran in it become proven (wheel 0.0.24), so the answer carries
        // the skill list the way a tool reply does: the host mirrors proof to
        // the registry from the difference.
        result = JSON.parse(
          py.runPython(`
import json
json.dumps({
    "pushback": session.unverified(),
    "skills": session.store.names(),
    "unproven": session.store.unproven(),
})
`),
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
    // Geometry moves by transfer, not by copy: the Panda's meshes are several
    // megabytes and a structured clone of them on every boot is a pause the
    // owner sees. The buffer is detached here and owned by the main thread
    // after this line, which is fine — the worker never reads it again.
    const geometry = (result as { kinematics?: { meshBuffer?: ArrayBuffer } } | null)?.kinematics
      ?.meshBuffer;
    self.postMessage(
      { id: request.id, ok: true, result } as WorkerResponse,
      geometry ? [geometry] : [],
    );
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } as WorkerResponse);
  }
};
