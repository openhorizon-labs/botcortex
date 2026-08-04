/**
 * The browser sim, wearing the runtime's wire protocol.
 *
 * `robot-provider.tsx` speaks `RobotMessage`/`ClientMessage` over a WebSocket.
 * Rather than teach it a second vocabulary, the browser sim speaks the same
 * one over an in-process channel — so the chat pane, the tool trace, the skill
 * list, the STOP control and the R3F view all work without knowing whether the
 * physics is on a robot across the room or in this tab.
 *
 * That is also the honest test of the abstraction: if something here needed a
 * message the runtime does not send, the two would have diverged.
 */

import type { ClientMessage, RobotMessage } from "@/lib/robot/protocol";
import { teach } from "@/lib/robot/agent/loop";
import { BrowserSim } from "@/lib/robot/browser-sim/host";

export type Emit = (message: RobotMessage) => void;

/** ~15 Hz, matching the runtime's state stream. */
const STATE_INTERVAL_MS = 66;

export class BrowserSimTransport {
  private sim: BrowserSim | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;
  private busy = false;

  constructor(private emit: Emit) {}

  /** Boot the sim and send the same hello a runtime would. */
  async open(onProgress: (stage: string) => void = () => {}) {
    this.sim = await BrowserSim.boot(onProgress);

    this.emit({
      type: "hello",
      robot: {
        name: "OpenArm v1 (browser sim)",
        platform: "wasm",
        version: this.sim.contract.version,
        gripper: this.sim.gripper,
      },
      skills: this.sim.skills,
      stopped: this.sim.stopped,
      resettable: true,
      // The credit is the account's and it is genuinely being spent, so this
      // reports paired — the sidebar figure is telling the truth here.
      paired: true,
      halfPaired: false,
      fixtures: this.sim.scene.fixtures,
    });
    this.emit({ type: "status", state: "idle" });

    // The joint stream the sim view consumes. A timer rather than an event per
    // frame: the renderer wants the CURRENT pose at its own cadence, and
    // flooding it with 20 Hz updates it will coalesce anyway is wasted work.
    this.ticker = setInterval(() => {
      if (this.sim) {
        this.emit({ type: "state", arms: this.sim.state, objects: this.sim.scene.objects });
      }
    }, STATE_INTERVAL_MS);
  }

  close() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.abort?.abort();
    // Terminates the worker: Pyodide and MuJoCo are ~100 MB of resident WASM,
    // and leaking a thread per connect would be felt within a few reconnects.
    this.sim?.close();
    this.sim = null;
  }

  /** The runtime's REST STOP, which has no host here — same latch either way. */
  stop() {
    this.sim?.stop();
    this.abort?.abort();
    this.emit({ type: "estop", stopped: true });
  }

  resetStop() {
    this.sim?.resetStop();
    this.emit({ type: "estop", stopped: false });
  }

  async send(message: ClientMessage, model: string) {
    const sim = this.sim;
    if (!sim) return;

    switch (message.type) {
      case "ping":
        this.emit({ type: "pong" });
        return;

      case "reset_sim":
        // Never mid-teach: teleporting the arm under a running skill would
        // corrupt what the agent is verifying. Same rule as the runtime.
        if (!this.busy) {
          void sim
            .reset()
            .then(() => this.emit({ type: "state", arms: sim.state, objects: sim.scene.objects }));
        }
        return;

      case "chat":
        await this.run(() => this.teach(sim, message.text, message.model ?? model));
        return;

      case "run_skill":
        await this.run(() => this.runSkill(sim, message.name));
        return;
    }
  }

  /** One job at a time, exactly as the runtime refuses a second. */
  private async run(job: () => Promise<void>) {
    if (this.busy) {
      this.emit({
        type: "chat",
        text: "The robot is still working on the last task. Wait for it to finish, or press STOP.",
      });
      return;
    }
    this.busy = true;
    this.abort = new AbortController();
    this.sim?.clearAbort();
    try {
      await job();
    } finally {
      this.busy = false;
      this.abort = null;
      this.emit({ type: "status", state: "idle" });
    }
  }

  private async teach(sim: BrowserSim, text: string, model: string) {
    this.emit({ type: "status", state: "teaching", detail: "Authoring a skill" });

    // Past failures carry lessons — the same first step the runtime's prompt
    // instructs, done here so the model sees them in its opening message.
    const episodes = await sim.callTool("recall_episodes", { query: text }, () => {});
    const prompt =
      episodes && episodes !== "[]"
        ? `Relevant past episodes (apply their lessons):\n${episodes}\n\nTask: ${text}`
        : `No relevant past episodes.\n\nTask: ${text}`;

    const before = new Set(sim.skills);
    const saved: string[] = [];

    // Nothing this teach has not itself shown counts as evidence for it.
    await sim.beginTask();

    const result = await teach({
      contract: sim.contract,
      model,
      prompt,
      signal: this.abort?.signal,
      emit: this.emit,
      // The gate on saying "done" — the runtime's, not a second copy of it.
      verify: () => sim.verify(),
      dispatch: async (name, args) => {
        const out = await sim.callTool(name, args, (arms) =>
          this.emit({ type: "state", arms, objects: sim.scene.objects }),
        );
        // The skill list can change under save_skill; the sidebar watches this.
        this.emit({ type: "skills", skills: sim.skills });
        for (const skill of sim.skills) {
          if (!before.has(skill) && !saved.includes(skill)) saved.push(skill);
        }
        return out;
      },
    });

    // The other half of the failure-memory loop. Written even when the teach
    // fails — especially then, since a failed attempt is what carries a lesson
    // worth recalling.
    await sim.logEpisode(text, saved, result.outcome, result.error);
  }

  private async runSkill(sim: BrowserSim, name: string) {
    this.emit({ type: "status", state: "running", detail: name });
    const reply = await sim.runTool(
      "run_skill",
      { name, params_json: "{}" },
      (arms) => this.emit({ type: "state", arms, objects: sim.scene.objects }),
    );
    // The owner-facing wording, not the model's. What run_skill returns is
    // written for something that has to repair a skill — primitive counts,
    // rehearsal bookkeeping, advice on approaching an obstacle. The rule that
    // rewrites it is the runtime's, so this button and the robot's own say the
    // same thing.
    this.emit({ type: "chat", text: reply.plain });
  }
}
