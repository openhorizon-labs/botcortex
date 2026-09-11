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

import type { ChatHistoryEntry, ClientMessage, RobotMessage } from "@/lib/robot/protocol";
import { teach } from "@/lib/robot/agent/loop";
import { BrowserSim, type FlushReport } from "@/lib/robot/browser-sim/host";
import { explain } from "@/lib/robot/agent/explain";
import { AccountChangedError, accountFetcher, currentAccount } from "@/lib/robot/account";

/**
 * The conversation so far, rendered for the model. Each teach is a fresh
 * model conversation, so without this "no, put it back" arrives meaning
 * nothing — watched live: told exactly that, the agent re-ran the skill it
 * was being corrected about. Mirrors agent.py's rendering, so a robot and a
 * browser read the same conversation the same way.
 */
export function transcriptOf(history?: ChatHistoryEntry[]): string {
  if (!history?.length) return "";
  const lines = history
    .filter((entry) => entry.text)
    .map((entry) => `${entry.role === "owner" ? "Owner" : "Robot"}: ${entry.text}`)
    .join("\n");
  if (!lines) return "";
  return `The conversation so far — short follow-ups and corrections refer to it:\n${lines}\n\n`;
}

export type Emit = (message: RobotMessage) => void;

/** ~15 Hz, matching the runtime's state stream. */
const STATE_INTERVAL_MS = 66;

/** The Web Locks name one tab holds while it owns the account's memory. */
const MEMORY_LEASE = "botcortex.sim.memory";

/** Events that belong to a run and carry its id (protocol v2). */
const RUN_SCOPED = new Set<RobotMessage["type"]>(["status", "chat", "tool", "tool_result", "model", "plan", "step"]);

/** A saved skill, kept so a failed registry sync can be retried without a
 *  racing `list_skills` call later (audit B04). */
type SavedSkill = { code: string; description: string };

/**
 * Push one saved skill to the account registry, through the same-origin
 * rewrite the inference calls use.
 */
async function persistSkill(name: string, skill: SavedSkill, request: ReturnType<typeof accountFetcher>): Promise<boolean> {
  try {
    const response = await request("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: skill.description,
        code: skill.code,
        // The wheel the sim boots is the openarm_v1 build; when a second
        // platform ships, this should ride in the agent contract instead.
        platform: "openarm_v1",
      }),
    });
    return response.ok;
  } catch {
    // The sim's local copy is the one that runs; the registry copy arrives
    // late or not at all, exactly like a robot with a flaky uplink.
    return false;
  }
}

/**
 * Whose robot this is — the account id, or null when signed out or the api
 * is away. Memory is mounted under it, so two accounts on one browser never
 * read each other's skills (audit B02).
 */
async function accountNamespace(signal: AbortSignal): Promise<string | null> {
  try {
    return await currentAccount(signal);
  } catch {
    signal.throwIfAborted();
    return null;
  }
}

export type TransportOptions = {
  /** The worker died or hung past its deadline; the sim is already closed. */
  onDead?: (reason: string) => void;
  /** Identity of the provider that owns this transport, when available. */
  accountId?: string | null;
  onAccountChanged?: () => void;
};

/**
 * The description a skill declares in its META block, read from the code
 * being saved rather than from a later `list_skills` reply. A regex, not a
 * parser: META is a dict literal the runtime validates on save, and this
 * only needs the one string out of it for the registry card.
 */
function describedAs(code: string): string {
  const match = /["']description["']\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/.exec(code);
  return match ? match[2] : "";
}

export class BrowserSimTransport {
  private sim: BrowserSim | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;
  private busy = false;
  private closed = false;
  private opening = false;
  private readonly deliver: Emit;
  private readonly onDead: (reason: string) => void;
  /** The run whose events are being emitted, stamped onto each one. */
  private currentRun: string | undefined;
  /** Releases the memory lease; set only when this tab holds it. */
  private releaseLease: (() => void) | null = null;
  /** Skills saved this session, by name, for registry retries. */
  private readonly saved = new Map<string, SavedSkill>();
  /** Whether something taught is not yet in durable storage. */
  private unsaved = false;
  private readonly lifetime = new AbortController();
  private readonly accountId: string | null | undefined;
  private readonly onAccountChanged: () => void;
  private request!: ReturnType<typeof accountFetcher>;

  constructor(emit: Emit, options: TransportOptions = {}) {
    this.deliver = emit;
    this.onDead = options.onDead ?? (() => {});
    this.accountId = options.accountId;
    this.onAccountChanged = options.onAccountChanged ?? (() => this.onDead(new AccountChangedError().message));
  }

  private emit: Emit = (message) => {
    if (this.closed) return;
    if (this.currentRun && RUN_SCOPED.has(message.type) && !("runId" in message && message.runId)) {
      this.deliver({ ...message, runId: this.currentRun } as RobotMessage);
      return;
    }
    this.deliver(message);
  };

  /**
   * One tab writes the account's memory at a time. Two tabs with the same
   * IDBFS mount would each flush their own view of /data and the last one
   * to write would win — silently dropping the other's skill. The second
   * tab boots session-only instead, and says so.
   */
  private async acquireLease(namespace: string): Promise<boolean> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks || this.closed) return false;
    return new Promise<boolean>((decide) => {
      const cancelled = () => decide(false);
      this.lifetime.signal.addEventListener("abort", cancelled, { once: true });
      void locks.request(`${MEMORY_LEASE}:${namespace}`, { ifAvailable: true }, (lock) => {
        if (!lock || this.closed) {
          decide(false);
          return;
        }
        // Held until close(): the lock lives as long as this promise.
        const held = new Promise<void>((release) => { this.releaseLease = release; });
        decide(true);
        return held;
      }).catch(() => decide(false)).finally(() =>
        this.lifetime.signal.removeEventListener("abort", cancelled),
      );
    });
  }

  /** Boot the sim and send the same hello a runtime would. */
  async open(onProgress: (stage: string) => void = () => {}) {
    if (this.closed || this.opening || this.sim) throw new Error("Simulator already opened or closed.");
    this.opening = true;
    let sim: BrowserSim;
    let namespace: string | null = null;
    let leaseHeld = false;
    try {
      onProgress("Checking who you are");
      namespace = await accountNamespace(this.lifetime.signal);
      this.lifetime.signal.throwIfAborted();
      if (this.accountId !== undefined && this.accountId !== namespace) {
        this.onAccountChanged();
        throw new AccountChangedError();
      }
      this.request = accountFetcher(namespace, this.lifetime.signal, () => {
        this.close();
        this.onAccountChanged();
      });
      leaseHeld = namespace ? await this.acquireLease(namespace) : false;
      this.lifetime.signal.throwIfAborted();
      sim = await BrowserSim.boot((stage) => {
        if (!this.closed) onProgress(stage);
      }, {
        namespace: leaseHeld ? namespace : null,
        signal: this.lifetime.signal,
        onDead: (reason) => {
          if (this.closed) return;
          this.emit({ type: "chat", text: `${reason}. Reconnect the in-browser robot to continue.` });
          this.close();
          this.onDead(reason);
        },
      });
      if (this.closed) {
        sim.close();
        throw new Error("Simulator closed while starting.");
      }
    } catch (error) {
      this.close();
      throw error;
    } finally {
      this.opening = false;
    }
    this.sim = sim;

    this.emit({
      type: "hello",
      robot: {
        name: "OpenArm v1 (browser sim)",
        platform: "wasm",
        version: this.sim.contract.version,
        gripper: this.sim.gripper,
      },
      skills: this.sim.skills,
      unproven: this.sim.unproven,
      stopped: this.sim.stopped,
      resettable: true,
      // The credit is the account's and it is genuinely being spent, so this
      // reports paired — the sidebar figure is telling the truth here.
      paired: true,
      halfPaired: false,
      fixtures: this.sim.scene.fixtures,
    });
    this.emit({ type: "status", state: "idle" });
    this.emit({
      type: "memory",
      durable: sim.memory.durable,
      unsaved: false,
      detail: sim.memory.durable
        ? "Skills and episodes are kept in this browser, under your account."
        : namespace === null
          ? "Not signed in, so skills and episodes last for this session only."
          : !leaseHeld
            ? "Exclusive browser storage is unavailable or held by another tab; this one is session-only."
            : `Browser storage is unavailable (${sim.memory.error ?? "unknown"}); session only.`,
    });

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
    this.closed = true;
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.lifetime.abort();
    this.abort?.abort();
    // Terminates the worker: Pyodide and MuJoCo are ~100 MB of resident WASM,
    // and leaking a thread per connect would be felt within a few reconnects.
    this.sim?.close();
    this.sim = null;
    this.releaseLease?.();
    this.releaseLease = null;
    this.saved.clear();
  }

  /** The runtime's REST STOP, which has no host here — same latch either way. */
  async stop() {
    const sim = this.sim;
    if (!sim || this.closed) return false;
    this.abort?.abort();
    await sim.stop();
    this.emit({ type: "estop", stopped: true });
    return true;
  }

  async resetStop() {
    if (!this.sim || this.closed || this.busy) return false;
    await this.sim.resetStop();
    this.emit({ type: "estop", stopped: false });
    return true;
  }

  async send(message: ClientMessage, model: string) {
    const sim = this.sim;
    if (!sim || this.closed) return;

    switch (message.type) {
      case "ping":
        this.emit({ type: "pong" });
        return;

      case "reset_sim":
        // Never mid-teach: teleporting the arm under a running skill would
        // corrupt what the agent is verifying. Same rule as the runtime.
        if (!this.busy) {
          await this.run(async () => {
            await sim.reset();
            this.emit({ type: "state", arms: sim.state, objects: sim.scene.objects });
          });
        }
        return;

      case "chat":
        await this.run(() =>
          this.teach(sim, message.text, message.model ?? model, message.history),
          message.runId,
        );
        return;

      case "run_skill":
        await this.run(() => this.runSkill(sim, message.name), message.runId);
        return;

      case "sync_skill": {
        const skill = this.saved.get(message.name);
        if (!skill) {
          this.emit({ type: "sync", skill: message.name, ok: false });
          return;
        }
        this.emit({ type: "sync", skill: message.name, ok: await persistSkill(message.name, skill, this.request) });
        return;
      }
    }
  }

  /** One job at a time, exactly as the runtime refuses a second. */
  private async run(job: () => Promise<void>, runId?: string) {
    if (this.busy) {
      this.emit({
        type: "chat",
        text: "The robot is still working on the last task. Wait for it to finish, or press STOP.",
      });
      return;
    }
    this.busy = true;
    this.currentRun = runId;
    this.abort = new AbortController();
    this.sim?.clearAbort();
    try {
      await job();
    } catch (error) {
      if (!this.closed) {
        console.error("[botcortex] simulator task failed", error);
        this.emit({ type: "chat", text: explain(error) });
      }
    } finally {
      this.busy = false;
      this.abort = null;
      this.emit({ type: "status", state: "idle" });
      this.currentRun = undefined;
    }
  }

  /**
   * What a tool did to the robot's files, reported the moment it is known.
   * Durable and flushed: nothing to say. Anything else is unsaved state the
   * owner must see before closing the tab.
   */
  private reportFlush(sim: BrowserSim, report: FlushReport | null) {
    if (!report) return;
    const unsaved = !report.flushed;
    if (unsaved === this.unsaved && !unsaved) return;
    this.unsaved = unsaved;
    this.emit({
      type: "memory",
      durable: sim.memory.durable,
      unsaved,
      detail: unsaved
        ? sim.memory.durable
          ? `The last change could not be saved to this browser (${report.error ?? "unknown"}).`
          : "Taught this session only — it will not survive a reload."
        : undefined,
    });
  }

  private async teach(
    sim: BrowserSim,
    text: string,
    model: string,
    history?: ChatHistoryEntry[],
  ) {
    this.emit({ type: "status", state: "teaching", detail: "Authoring a skill" });

    // Past failures carry lessons — the same first step the runtime's prompt
    // instructs, done here so the model sees them in its opening message.
    const episodes = await sim.callTool("recall_episodes", { query: text }, () => {});
    const lessons =
      episodes && episodes !== "[]"
        ? `Relevant past episodes (apply their lessons):\n${episodes}`
        : "No relevant past episodes.";
    const prompt = `${transcriptOf(history)}${lessons}\n\nTask: ${text}`;

    const before = new Set(sim.skills);
    const saved: string[] = [];

    // Nothing this teach has not itself shown counts as evidence for it.
    await sim.beginTask();

    const result = await teach({
      contract: sim.contract,
      model,
      prompt,
      signal: this.abort?.signal,
      fetcher: this.request,
      emit: this.emit,
      // The gate on saying "done" — the runtime's, not a second copy of it.
      verify: () => sim.verify(),
      dispatch: async (name, args) => {
        const reply = await sim.runTool(name, args, (arms) =>
          this.emit({ type: "state", arms, objects: sim.scene.objects }),
        );
        const out = reply.output;
        this.reportFlush(sim, reply.memory);
        // The skill list can change under save_skill; the sidebar watches this.
        this.emit({ type: "skills", skills: sim.skills, unproven: sim.unproven });
        for (const skill of sim.skills) {
          if (!before.has(skill) && !saved.includes(skill)) saved.push(skill);
        }
        // Phase 5: a skill saved in the browser also lands in the account
        // registry, so pairing a real arm later finds it waiting. Fired and
        // not awaited — best-effort like the runtime's cloud.sync_skill; the
        // teach must not slow down or fail because the registry is away.
        if (name === "save_skill" && out.startsWith("saved ")) {
          const skill = String(args.name ?? "");
          // The revision captured NOW, at save time, is what any retry
          // sends: a later list_skills could describe a newer save.
          const revision: SavedSkill = {
            code: String(args.code ?? ""),
            description: describedAs(String(args.code ?? "")),
          };
          this.saved.set(skill, revision);
          void persistSkill(skill, revision, this.request).then((ok) =>
            this.emit({ type: "sync", skill, ok }),
          );
        }
        return out;
      },
    });

    // The other half of the failure-memory loop. Written even when the teach
    // fails — especially then, since a failed attempt is what carries a lesson
    // worth recalling.
    this.reportFlush(sim, await sim.logEpisode(text, saved, result.outcome, result.error));
  }

  private async runSkill(sim: BrowserSim, name: string) {
    this.emit({ type: "status", state: "running", detail: name });
    const reply = await sim.runTool(
      "run_skill",
      { name, params_json: "{}" },
      (arms) => this.emit({ type: "state", arms, objects: sim.scene.objects }),
    );
    this.reportFlush(sim, reply.memory);
    // The owner-facing wording, not the model's. What run_skill returns is
    // written for something that has to repair a skill — primitive counts,
    // rehearsal bookkeeping, advice on approaching an obstacle. The rule that
    // rewrites it is the runtime's, so this button and the robot's own say the
    // same thing.
    this.emit({ type: "chat", text: reply.plain });
    this.emit({ type: "skills", skills: sim.skills, unproven: sim.unproven });
  }
}
