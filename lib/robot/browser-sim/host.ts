/**
 * The robot, running entirely in the page.
 *
 * Three pieces, none of them a reimplementation:
 *   - Pyodide runs the runtime's own wheel: plan_move, JointMap, the restricted
 *     skill executor, WasmRobot, RobotSession.
 *   - @mujoco/mujoco runs the physics — DeepMind's WASM build of the same
 *     engine version the runtime uses, fed the same MJCF and meshes.
 *   - the wheel supplies the code, the model assets AND agent_contract.json, so
 *     all three are the same release by construction.
 *
 * Everything is served from our own origin. The sim is the first thing a new
 * account touches, and making it depend on a CDN being reachable would turn
 * onboarding into someone else's uptime.
 *
 * ON PACING — the decision the plan left open.
 *
 * A skill executes SYNCHRONOUSLY and as fast as the CPU allows, and the
 * recorded trajectory is then played back at the control rate. This is not an
 * approximation of real-time motion: `plan_move`'s frames and the substep count
 * are functions of the commanded move, not of wall-clock, so `realtime` only
 * ever controlled whether Python called time.sleep. Executing fast and
 * replaying at 20 Hz produces exactly the trajectory a paced run would, and
 * displays it at exactly the same speed.
 *
 * The alternative was a Web Worker with a SharedArrayBuffer interrupt buffer,
 * which needs COOP/COEP headers on the whole app and — the actual killer —
 * cannot deliver a STOP message while Python is blocked inside sleep, because
 * a blocked worker never drains its message queue. Here the main thread is free
 * between every frame, so STOP lands immediately.
 */

import { type AgentContract, parseContract } from "@/lib/robot/agent/contract";
import type { JointState } from "@/lib/robot/protocol";

export const WHEEL_URL = "/botcortex/botcortex-0.0.1-py3-none-any.whl";
const PYODIDE_URL = "/pyodide/";
const PYODIDE_ENTRY = "/pyodide/pyodide.mjs";
const MUJOCO_URL = "/mujoco/mujoco.js";

/** Control rate, mirrored from botcortex.config.CONTROL_HZ. Only used to pace
 *  PLAYBACK — the trajectory itself is computed by the Python. */
const CONTROL_HZ = 20;

export interface SimProgress {
  (stage: string): void;
}

/** One frame of the recorded motion: every arm's joint angles in degrees. */
type Frame = JointState;

export class BrowserSim {
  private py: any;
  private mj: any;
  private session: any;
  /** Set while playback is running, so STOP can cut it short. */
  private aborted = false;

  /** Latest joint state, read by the R3F view every frame. */
  state: JointState = {};
  /** The skills the robot knows, as the sidebar shows them. */
  skills: string[] = [];
  /** Read out of the installed wheel, never from a copy in this repo — the
   *  whole reason the runtime exports it. */
  contract!: AgentContract;

  static async boot(onProgress: SimProgress = () => {}): Promise<BrowserSim> {
    const sim = new BrowserSim();
    await sim.init(onProgress);
    return sim;
  }

  private async init(onProgress: SimProgress) {
    onProgress("Starting Python");
    // Loaded from our own origin at RUN time, never bundled. Pyodide reaches
    // for pyodide.asm.mjs with a dynamic import the bundler cannot resolve
    // statically ("Cannot find module as expression is too dynamic"), and the
    // wasm is 12 MB that has no business in a JS chunk regardless.
    const { loadPyodide } = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ PYODIDE_ENTRY
    );
    this.py = await loadPyodide({ indexURL: PYODIDE_URL });

    onProgress("Loading the robot runtime");
    const wheel = new Uint8Array(await (await fetch(WHEEL_URL)).arrayBuffer());
    this.py.FS.writeFile("/botcortex.whl", wheel);
    // Unzipped rather than micropip-installed: a wheel is a zip, the package is
    // pure Python, and micropip would fetch itself from a CDN and then try to
    // resolve fastapi/uvicorn — which the browser does not use and cannot
    // install (uvloop has no pure-Python wheel). Extracting also leaves real
    // files, which matters because the model assets and agent_contract.json are
    // read with pathlib.
    this.py.runPython(`
import sys, zipfile
zipfile.ZipFile("/botcortex.whl").extractall("/pkg")
sys.path.insert(0, "/pkg")
`);

    onProgress("Loading physics");
    const mujocoFactory = (
      await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ MUJOCO_URL)
    ).default;
    this.mj = await mujocoFactory();

    onProgress("Loading the arm");
    // The model rides in the same wheel as the code, so they cannot disagree.
    // The two WASM modules have separate filesystems, hence the copy.
    const modelDir: string = this.py.runPython(`
import pathlib, botcortex
str(pathlib.Path(botcortex.__file__).parent / "platforms" / "openarm_v1" / "model")
`);
    const assets: string[] = JSON.parse(
      this.py.runPython(`
import json, pathlib
json.dumps([str(p) for p in pathlib.Path("${modelDir}").rglob("*") if p.is_file()])
`),
    );
    this.mj.FS.mkdirTree("/model", 0o777);
    for (const path of assets) {
      const dest = `/model/${path.slice(modelDir.length + 1)}`;
      this.mj.FS.mkdirTree(dest.slice(0, dest.lastIndexOf("/")), 0o777);
      this.mj.FS.writeFile(dest, this.py.FS.readFile(path));
    }
    const model = this.mj.MjModel.from_xml_path("/model/openarm_bimanual.xml");

    onProgress("Waking the robot");
    this.py.globals.set("js_mujoco", this.mj);
    this.py.globals.set("js_model", model);
    this.py.globals.set("js_data", new this.mj.MjData(model));
    this.py.runPython(`
from pathlib import Path
from botcortex.memory import EpisodeMemory
from botcortex.session import RobotSession
from botcortex.skills import SkillStore
from botcortex.wasm import WasmRobot

Path("/data/skills").mkdir(parents=True, exist_ok=True)
STOP_FILE = Path("/data/STOP")
session = RobotSession(
    # realtime=False: the trajectory is identical either way, and the browser
    # paces PLAYBACK instead — see the note at the top of host.ts.
    WasmRobot(js_mujoco, js_model, js_data, stop_file=STOP_FILE, realtime=False),
    store=SkillStore("/data/skills"),
    memory=EpisodeMemory("/data/episodes.jsonl"),
)
`);
    this.session = this.py.globals.get("session");
    this.contract = parseContract(
      this.py.runPython(`
import pathlib, botcortex
(pathlib.Path(botcortex.__file__).parent / "agent_contract.json").read_text()
`),
    );
    this.refresh();
  }

  /** Read the arm's current pose out of Python. */
  private refresh() {
    this.state = JSON.parse(
      this.py.runPython(`
import json
json.dumps({arm: session.robot.get_positions(arm) for arm in ("right", "left")})
`),
    );
    this.skills = JSON.parse(this.py.runPython(`import json; json.dumps(session.store.names())`));
  }

  /** Frames recorded by the last tool call, then cleared. */
  private drainMotion(): Frame[] {
    const raw: string = this.py.runPython(`
import json
log = [e for e in session.robot.motion_log if e[0] == "step"]
session.robot.motion_log.clear()
json.dumps([{"arm": arm, "positions": pos} for _, arm, pos in log])
`);
    const entries: Array<{ arm: string; positions: Record<string, number> }> = JSON.parse(raw);
    // A frame names one arm; the other holds its pose, so each displayed frame
    // is the whole robot rather than half of it.
    const running: JointState = JSON.parse(JSON.stringify(this.state));
    return entries.map((entry) => {
      running[entry.arm] = entry.positions;
      return JSON.parse(JSON.stringify(running));
    });
  }

  /**
   * Run one tool, then play its motion at the control rate.
   *
   * The model does not get its result until the arm has finished moving on
   * screen, so what an owner watches and what the agent believes stay in step —
   * and a STOP during playback aborts the teach rather than being overtaken by
   * the next tool call.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    onFrame: (state: JointState) => void,
  ): Promise<string> {
    const result = String(this.session.call_tool(name, this.py.toPy(args)));
    const frames = this.drainMotion();
    await this.play(frames, onFrame);
    this.refresh();
    return result;
  }

  private async play(frames: Frame[], onFrame: (state: JointState) => void) {
    if (frames.length === 0) return;
    const tick = 1000 / CONTROL_HZ;
    let next = performance.now();
    for (const frame of frames) {
      if (this.aborted) return;
      this.state = frame;
      onFrame(frame);
      next += tick;
      const wait = next - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }

  /** The e-stop, through the same file every other backend checks. */
  stop() {
    this.aborted = true;
    this.py.runPython(`STOP_FILE.touch()`);
  }

  resetStop() {
    this.aborted = false;
    this.py.runPython(`STOP_FILE.unlink(missing_ok=True)`);
  }

  get stopped(): boolean {
    return this.py.runPython(`STOP_FILE.exists()`) as boolean;
  }

  /** Snap the arm home — a page refresh should give a clean scene. */
  reset() {
    this.aborted = false;
    this.py.runPython(`session.robot.reset()`);
    this.refresh();
  }

  /** Lets a teach begin from a clean slate after an abort. */
  clearAbort() {
    this.aborted = false;
  }
}
