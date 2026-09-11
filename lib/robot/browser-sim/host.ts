/**
 * The robot, running entirely in the page — main-thread side.
 *
 * All the weight is in worker.ts: Pyodide running the runtime's own wheel, and
 * DeepMind's WASM build of MuJoCo running the physics, both fed by the same
 * versioned artifact so code, model and agent contract cannot disagree.
 *
 * What stays HERE is playback. A skill executes in the worker as fast as the
 * CPU allows and returns its recorded trajectory; this class then plays those
 * frames at the control rate. That is not an approximation of a paced run:
 * `plan_move`'s frames and the substep count are functions of the commanded
 * move, never of wall-clock, so executing fast and replaying at 20 Hz produces
 * exactly the trajectory a real-time run would, displayed at the same speed.
 *
 * STOP cuts playback before another frame is shown. Its worker message is
 * processed only after the current synchronous Python call returns; long or
 * hung calls still need the interrupt/deadline work documented in the audit.
 */

import { type AgentContract, parseContract } from "@/lib/robot/agent/contract";
import type { Pushback } from "@/lib/robot/agent/loop";
import type { JointState, SceneBodies } from "@/lib/robot/protocol";
import type { WorkerRequest, WorkerResponse } from "@/lib/robot/browser-sim/worker";

/** Control rate, mirrored from botcortex.config.CONTROL_HZ. Paces PLAYBACK
 *  only — the trajectory itself is computed by the Python. */
const CONTROL_HZ = 20;

/**
 * How long each kind of request may take before the worker is declared
 * hung (audit B05). Generous, because they bound a WORKING robot's slowest
 * honest case: a cold boot downloads ~14 MB, and a skill that loops over
 * every block runs its physics as fast as the CPU allows but still runs it.
 * A request that outlives its deadline settles with an error that names
 * the deadline, and the worker is terminated — there is no interrupting a
 * synchronous Pyodide call from outside, so a fresh worker is the recovery.
 */
export const DEADLINES_MS: Record<WorkerRequest["type"], number> = {
  boot: 240_000,
  callTool: 120_000,
  reset: 15_000,
  seek: 15_000,
  logEpisode: 15_000,
  beginTask: 15_000,
  verify: 15_000,
  stop: 15_000,
  resetStop: 15_000,
};

export type MemoryReport = {
  /** Backed by IndexedDB under the account, or session-only. */
  durable: boolean;
  /** Why it is session-only, when it was meant not to be. */
  error?: string;
};

export type FlushReport = { flushed: boolean; error?: string };

export type SimProgress = (stage: string) => void;

/** A request before the id is stamped on. Written as a distributive
 *  conditional because Omit<> over a union collapses it to the common keys,
 *  which here is just `type` — losing every argument. */
type PendingRequest = WorkerRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;

interface ToolReply {
  /** What the MODEL is handed back. */
  output: string;
  /** The same event for the person watching — see session.for_owner. */
  plain: string;
  /** One frame per control tick. `objects` is where every block stood at
   *  that tick — [x, y, z, qw, qx, qy, qz] per name, straight from the
   *  runtime's object_log — so a carried block RIDES the playback instead of
   *  teleporting to its destination before the arm sets off. */
  motion: Array<{
    arm: string;
    positions: Record<string, number>;
    objects: Record<string, number[]> | null;
  }>;
  state: JointState;
  scene: { objects: SceneBodies; fixtures: SceneBodies };
  skills: string[];
  unproven: string[];
  stopped: boolean;
  /** Present after a tool that changes /data: whether the change reached
   *  storage. Null for tools with nothing to save. */
  memory: FlushReport | null;
}

export type BrowserSimOptions = {
  /** The account to mount memory under, or null for session-only. */
  namespace?: string | null;
  /** Called once if the worker dies or hangs past a deadline, after every
   *  pending call has been rejected. The transport reports it upward. */
  onDead?: (reason: string) => void;
};

export class BrowserSim {
  private worker!: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private onProgress: SimProgress = () => {};
  /** Cuts playback short when STOP lands. */
  private aborted = false;
  private closed = false;

  /** Latest joint state, read by the R3F view every frame. */
  state: JointState = {};
  /** The skills the robot knows, as the sidebar shows them. */
  skills: string[] = [];
  /** Of those, the ones never seen to run to completion. */
  unproven: string[] = [];
  /** Whether the e-stop is already latched — the hello carries it. */
  stopped = false;
  /** The loaded platform's gripper mapping, for the viewer. */
  gripper?: { minDeg: number; maxDeg: number; travelM: number };
  /** What is on the table. Objects move with every tool call; fixtures do not. */
  scene: { objects: SceneBodies; fixtures: SceneBodies } = { objects: {}, fixtures: {} };
  /** Read out of the installed wheel, never from a copy in this repo. */
  contract!: AgentContract;
  /** How the robot's files are kept, as the worker reported at boot. */
  memory: MemoryReport = { durable: false };
  private onDead: (reason: string) => void = () => {};
  private deadReported = false;

  static async boot(onProgress: SimProgress = () => {}, options: BrowserSimOptions = {}): Promise<BrowserSim> {
    const sim = new BrowserSim();
    try {
      await sim.init(onProgress, options);
      return sim;
    } catch (error) {
      sim.close();
      throw error;
    }
  }

  private async init(onProgress: SimProgress, options: BrowserSimOptions) {
    this.onProgress = onProgress;
    this.onDead = options.onDead ?? (() => {});
    // A URL, not new URL(..., import.meta.url): letting the app bundler emit
    // the worker produces a CLASSIC one even when asked for a module, and
    // Pyodide refuses to run in a classic worker. scripts/vendor-runtimes.ts
    // builds the real module to /sim-worker.js.
    this.worker = new Worker("/sim-worker.js", { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if ("type" in message) {
        this.onProgress(message.stage);
        return;
      }
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.ok) waiter.resolve(message.result);
      else waiter.reject(new Error(message.error));
    };
    this.worker.onerror = (event) => {
      // A worker that dies takes every outstanding call with it; failing them
      // loudly beats a teach that hangs forever with no explanation.
      this.die(event.message || "the robot's thread stopped");
    };

    const booted = await this.ask({ type: "boot", namespace: options.namespace ?? null });
    this.contract = parseContract(booted.contract);
    this.state = booted.state;
    this.skills = booted.skills;
    this.unproven = booted.unproven;
    this.stopped = booted.stopped;
    this.gripper = booted.gripper;
    this.scene = booted.scene;
    this.memory = booted.memory ?? { durable: false };
  }

  /** Reject everything in flight, terminate, and say so once. */
  private die(reason: string) {
    const waiters = [...this.pending.values()];
    this.pending.clear();
    for (const waiter of waiters) waiter.reject(new Error(reason));
    const first = !this.closed && !this.deadReported;
    this.close();
    if (first) {
      this.deadReported = true;
      this.onDead(reason);
    }
  }

  private ask(request: PendingRequest): Promise<any> {
    if (this.closed) return Promise.reject(new Error("the in-browser robot was disconnected"));
    const id = this.nextId++;
    const deadline = DEADLINES_MS[request.type];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        // Everything else in flight dies with the worker, with the same
        // explanation — one hung call is one hung thread.
        this.die(`the in-browser robot did not answer "${request.type}" within ${Math.round(deadline / 1000)} s and was shut down`);
      }, deadline);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.worker.postMessage({ ...request, id } as WorkerRequest);
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
    return (await this.runTool(name, args, onFrame)).output;
  }

  /** As callTool, but keeping the owner-facing wording the Run button needs. */
  async runTool(
    name: string,
    args: Record<string, unknown>,
    onFrame: (state: JointState) => void,
  ): Promise<ToolReply> {
    const reply: ToolReply = await this.ask({ type: "callTool", name, args });
    this.skills = reply.skills;
    this.unproven = reply.unproven;
    this.stopped = reply.stopped;
    const played = await this.play(reply, onFrame);
    if (played) {
      this.state = reply.state;
      // The authoritative end state, AFTER playback: physics may settle a
      // block a little past the last recorded frame. Setting it before
      // playback was the teleport bug — the cube appeared at its destination
      // and the arm then set off to fetch nothing.
      this.scene = reply.scene;
    } else {
      // Aborted mid-playback. Assigning reply.state here — the pose physics
      // finished at — teleported the arm to the END of the move the owner had
      // just stopped, which is the exact opposite of stopping. Hold what was
      // shown, and rewind the worker to match so the next move plans from it.
      await this.seekToShown();
      onFrame(this.state);
    }
    return reply;
  }

  /** Returns false if STOP cut it short. */
  private async play(reply: ToolReply, onFrame: (state: JointState) => void): Promise<boolean> {
    if (this.aborted) return false;
    if (reply.motion.length === 0) return true;
    // A recorded frame names ONE arm; the other holds its pose, so each
    // displayed frame is the whole robot rather than half of it.
    const running: JointState = JSON.parse(JSON.stringify(this.state));
    const tick = 1000 / CONTROL_HZ;
    let next = performance.now();
    for (const entry of reply.motion) {
      if (this.aborted) return false;
      running[entry.arm] = entry.positions;
      this.state = JSON.parse(JSON.stringify(running));
      // The blocks move WITH the arm, frame by frame. Updated before
      // onFrame, so both the per-frame emit and the 15 Hz ticker read the
      // scene this frame actually showed.
      if (entry.objects) {
        const objects = { ...this.scene.objects };
        for (const [name, pose] of Object.entries(entry.objects)) {
          const known = objects[name];
          if (known) {
            objects[name] = {
              ...known,
              position: [pose[0], pose[1], pose[2]],
              orientation: [pose[3], pose[4], pose[5], pose[6]],
            };
          }
        }
        this.scene = { ...this.scene, objects };
      }
      onFrame(this.state);
      next += tick;
      const wait = next - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    return !this.aborted;
  }

  /**
   * Rewind physics to what the owner is looking at: the arm AND the objects.
   * The scene held here is the one displayed frame by frame during playback,
   * so it is exactly the pose a STOP froze on screen.
   */
  private async seekToShown(): Promise<void> {
    const objects: Record<string, number[]> = {};
    for (const [name, body] of Object.entries(this.scene.objects)) {
      objects[name] = [...body.position, ...body.orientation];
    }
    await this.ask({ type: "seek", state: this.state, objects });
  }

  /** Start a task with no claims about it. See `verify`. */
  async beginTask(): Promise<void> {
    await this.ask({ type: "beginTask" });
  }

  /**
   * Whether the robot can back up a claim that the task is done.
   *
   * Null means yes. Anything else is the runtime's own reason it cannot —
   * asked across the boundary rather than re-decided here, because a browser
   * that judged success by its own rules would be a differently strict robot
   * wearing the same name.
   */
  async verify(): Promise<Pushback | null> {
    return (await this.ask({ type: "verify" })) ?? null;
  }

  /** Record what this attempt taught, so the next teach can recall it.
   *  The runtime does this per teach; the browser skipping it left
   *  recall_episodes reading a store nothing ever wrote to. */
  async logEpisode(
    task: string,
    skills: string[],
    outcome: "ok" | "fail",
    error?: string,
  ): Promise<FlushReport> {
    return (await this.ask({ type: "logEpisode", task, skills, outcome, error })) as FlushReport;
  }

  /** The e-stop, through the same file every other backend checks. */
  async stop() {
    this.aborted = true;
    await this.ask({ type: "stop" });
    this.stopped = true;
  }

  async resetStop() {
    await this.ask({ type: "resetStop" });
    this.stopped = false;
    this.aborted = false;
  }

  /** Snap the arm home — a page refresh should give a clean scene. */
  async reset() {
    this.aborted = false;
    const snap = await this.ask({ type: "reset" });
    this.state = snap.state;
    this.scene = snap.scene;
  }

  /** Lets a teach begin from a clean slate after an abort. */
  clearAbort() {
    this.aborted = false;
  }

  close() {
    this.closed = true;
    this.aborted = true;
    this.worker?.terminate();
    // Reject, don't just drop: terminate() kills every in-flight call, and a
    // cleared map left `teach()` awaiting a promise that could never settle —
    // so connecting a real robot mid-teach hung the loop forever, holding the
    // whole transcript.
    for (const waiter of this.pending.values()) {
      waiter.reject(new Error("the in-browser robot was disconnected"));
    }
    this.pending.clear();
  }
}
