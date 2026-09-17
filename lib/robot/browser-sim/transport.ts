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

import type { ChatHistoryEntry, ClientMessage, RobotInfo, RobotMessage } from "@/lib/robot/protocol";
import { teach } from "@/lib/robot/agent/loop";
import { shortBodyName } from "@/lib/robot/bodies";
import { BrowserSim, type FlushReport } from "@/lib/robot/browser-sim/host";
import type { RegistrySkill } from "@/lib/robot/browser-sim/worker";
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
type SavedSkill = { code: string; description: string; proven?: boolean };

/**
 * Hand one recorder event (an episode, a tag, a repair link) to the account's
 * database. Fire and forget: a tab has no disk, so an event that does not land
 * is lost, and that is the contract — a run never waits on it.
 */
function persistEpisode(event: unknown, request: ReturnType<typeof accountFetcher>): void {
  void request("/api/episodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No `keepalive`: browsers cap a keepalive body at 64 KB, and a run of a
    // few hundred ticks is more than that.
    body: JSON.stringify(event),
  }).catch(() => {});
}

/** How long a boot waits for the registry before going on without it. */
const RESTORE_TIMEOUT_MS = 8_000;

/**
 * Push one saved skill to the account registry, through the same-origin
 * rewrite the inference calls use.
 */
async function persistSkill(name: string, skill: SavedSkill, request: ReturnType<typeof accountFetcher>, platform = "openarm_v1"): Promise<boolean> {
  try {
    const response = await request("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: skill.description,
        code: skill.code,
        // The body this skill was taught on. A skill that reads ctx.arms and
        // ctx.gripper_range runs elsewhere too; the registry still records
        // where it was proven.
        platform,
        proven: skill.proven === true,
      }),
    });
    return response.ok;
  } catch {
    // The sim's local copy is the one that runs; the registry copy arrives
    // late or not at all, exactly like a robot with a flaky uplink.
    return false;
  }
}

/** The registry's copy of one body's skills, or null when it cannot be
 *  reached — a boot then runs on the local store alone, as before. */
async function fetchRegistrySkills(request: ReturnType<typeof accountFetcher>, platform: string): Promise<RegistrySkill[] | null> {
  try {
    const response = await request(`/api/skills?platform=${encodeURIComponent(platform)}`, {
      signal: AbortSignal.timeout(RESTORE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { skills?: unknown };
    if (!Array.isArray(body.skills)) return null;
    return body.skills.filter(
      (row): row is RegistrySkill =>
        typeof row === "object" && row !== null &&
        typeof (row as RegistrySkill).name === "string" &&
        typeof (row as RegistrySkill).code === "string" &&
        typeof (row as RegistrySkill).description === "string",
    ).map((row) => ({ ...row, proven: row.proven === true, updatedAt: Number(row.updatedAt) || 0 }));
  } catch (error) {
    if (error instanceof AccountChangedError) throw error;
    return null;
  }
}

/** Tell the registry a skill it holds has now been seen to run. */
async function persistProof(name: string, request: ReturnType<typeof accountFetcher>, platform: string): Promise<boolean> {
  try {
    const response = await request(`/api/skills/${encodeURIComponent(name)}/ran`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    });
    return response.ok;
  } catch {
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
  /** Which body to boot, by catalog name; null for the wheel's default. */
  platform?: string | null;
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
  private readonly platform: string | null;
  private request!: ReturnType<typeof accountFetcher>;

  constructor(emit: Emit, options: TransportOptions = {}) {
    this.deliver = emit;
    this.onDead = options.onDead ?? (() => {});
    this.accountId = options.accountId;
    this.onAccountChanged = options.onAccountChanged ?? (() => this.onDead(new AccountChangedError().message));
    this.platform = options.platform ?? null;
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
  /** Names of this robot's working skills, most like `query` first — or null
   *  when the api cannot say (no credit, no key, offline, nothing to rank). */
  private async rankedSkills(sim: BrowserSim, query: string): Promise<string[] | null> {
    try {
      const candidates = JSON.parse(await sim.callTool("skill_candidates", {}, () => {})) as unknown[];
      if (!query.trim() || !Array.isArray(candidates) || candidates.length < 2) return null; // one skill needs no ranking
      const res = await this.request("/api/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, candidates }),
      });
      if (!res.ok) return null;
      const { ranked } = (await res.json()) as { ranked?: { name: string }[] | null };
      return Array.isArray(ranked) ? ranked.map((row) => row.name) : null;
    } catch {
      return null;
    }
  }

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
        platform: this.platform,
        signal: this.lifetime.signal,
        onWorking: (label, step) => {
          if (!this.closed) this.emit({ type: "working", label, step });
        },
        // Only for an account: a signed-out visitor's runs are nobody's to keep.
        onEpisode: (event) => {
          if (!this.closed && namespace) persistEpisode(event, this.request);
        },
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

    // The registry's copy outlives this browser: with an account signed in,
    // the local store is rebuilt from it before the hello lists anything,
    // whether or not this tab got durable storage. A skill taught here and
    // never synced goes the other way. Done before the hello so the first
    // list_skills already knows everything the account does.
    let restored = 0;
    if (namespace) {
      onProgress("Restoring your skills from your account");
      restored = await this.restoreSkills(sim);
      if (this.closed) return;
    }

    this.emit({
      type: "hello",
      robot: {
        name: `${shortBodyName(this.sim.displayName)} (browser sim)`,
        // The body's real catalog name, so the viewer can pick the right
        // drawing; "this browser" as the host is what marks it a sim.
        platform: this.sim.platform,
        version: this.sim.contract.version,
        gripper: this.sim.gripper,
        arms: Object.keys(this.sim.state),
        catalog: this.sim.catalog,
        kinematics: this.sim.kinematics as RobotInfo["kinematics"],
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
        ? `Skills are backed up to your account${restored ? ` (${restored} restored)` : ""}; episodes are kept in this browser.`
        : namespace === null
          ? "Not signed in, so skills and episodes last for this session only."
          : !leaseHeld
            ? "Exclusive browser storage is held by another tab; skills still sync to your account, episodes are session-only here."
            : `Browser storage is unavailable (${sim.memory.error ?? "unknown"}); skills still sync to your account, episodes are session-only.`,
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

  /**
   * Interrupt the agent without latching the e-stop.
   *
   * STOP is the e-stop: it halts motion and latches, and clearing it is a
   * deliberate act, which is right for "the arm is about to hit something"
   * and much too heavy for "this is not the task I meant". The agent loop
   * checks its signal between every turn and every tool call, so aborting it
   * stops the authoring within a tool call rather than mid-motion, and the
   * robot is idle and immediately usable afterwards.
   *
   * Returns false when there was nothing running, so the caller can leave the
   * UI alone rather than reporting a stop that did not happen.
   */
  interrupt(): boolean {
    if (this.closed || !this.busy || !this.abort) return false;
    this.abort.abort();
    this.emit({ type: "chat", text: "Stopped. The robot is idle — tell me what to do instead." });
    return true;
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
        this.emit({ type: "sync", skill: message.name, ok: await persistSkill(message.name, skill, this.request, this.sim?.platform) });
        return;
      }
    }
  }

  /**
   * Pull the account's skills for this body into the local store, and push
   * up whatever the registry is missing. Returns how many were restored.
   * Best-effort: a registry that is away leaves the local store as it was.
   */
  private async restoreSkills(sim: BrowserSim): Promise<number> {
    const platform = sim.platform;
    const rows = await fetchRegistrySkills(this.request, platform);
    if (rows === null || this.closed) return 0;
    let report: Awaited<ReturnType<BrowserSim["importSkills"]>>;
    try {
      report = await sim.importSkills(rows);
    } catch (error) {
      console.error("skill restore failed", error);
      return 0;
    }
    if (this.closed) return 0;
    if (report.memory) this.reportFlush(sim, report.memory);
    for (const [name, why] of report.rejected) console.warn(`registry skill ${name} rejected by the store: ${why}`);
    // Everything now in the store is retryable through sync_skill, and the
    // registry gets what it lacked — fired and not awaited, like a save's.
    for (const local of report.push) {
      const revision: SavedSkill = { code: local.code, description: local.description, proven: local.proven };
      this.saved.set(local.name, revision);
      void persistSkill(local.name, revision, this.request, platform).then((ok) =>
        this.emit({ type: "sync", skill: local.name, ok }),
      );
    }
    return report.restored.length;
  }

  /**
   * The store's proof mark, mirrored to the registry: any skill that was
   * unproven before this call and is proven now was just seen to run. A
   * registry that never got the skill (404) is sent the whole thing.
   */
  private markProven(sim: BrowserSim, unprovenBefore: string[]) {
    const platform = sim.platform;
    const still = new Set(sim.unproven);
    for (const name of unprovenBefore) {
      if (still.has(name) || !sim.skills.includes(name)) continue;
      const known = this.saved.get(name);
      if (known) known.proven = true;
      void persistProof(name, this.request, platform).then(async (ok) => {
        if (ok || this.closed) return;
        const skill = this.saved.get(name);
        this.emit({ type: "sync", skill: name, ok: skill ? await persistSkill(name, skill, this.request, platform) : false });
      });
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
    await sim.beginTask(text);

    const result = await teach({
      contract: sim.contract,
      // Always through our api. If the owner has saved their own key it is
      // THERE, not here: the api uses it, skips the credit gate, and answers in
      // the same shape, naming the model and provider that actually ran.
      model,
      prompt,
      signal: this.abort?.signal,
      fetcher: this.request,
      emit: this.emit,
      // The gate on saying "done" — the runtime's, not a second copy of it.
      verify: () => sim.verify(),
      dispatch: async (name, args) => {
        const unprovenBefore = sim.unproven;
        // "Which working skills are most like this task" is better answered by
        // meaning than by shared words, and the runtime cannot reach the
        // network from inside a synchronous Python call — so the host asks the
        // api first and hands the order in. Best effort: without an answer the
        // runtime counts words, as it would with no network at all.
        if (name === "recall_episodes") args = { ...args, ranked_json: JSON.stringify(await this.rankedSkills(sim, String(args.query ?? ""))) };
        const reply = await sim.runTool(name, args, (arms) =>
          this.emit({ type: "state", arms, objects: sim.scene.objects }),
        );
        const out = reply.output;
        this.reportFlush(sim, reply.memory);
        this.markProven(sim, unprovenBefore);
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
          void persistSkill(skill, revision, this.request, this.sim?.platform).then((ok) =>
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
    const unprovenBefore = sim.unproven;
    const reply = await sim.runTool(
      "run_skill",
      // No as_agent flag: this is the Run button. The runtime refuses to let
      // the MODEL reuse a skill that has never run successfully, because a
      // draft someone left behind is not something the robot knows how to do.
      // An owner running their own draft is how it earns that proof.
      { name, params_json: "{}" },
      (arms) => this.emit({ type: "state", arms, objects: sim.scene.objects }),
    );
    this.reportFlush(sim, reply.memory);
    this.markProven(sim, unprovenBefore);
    // The owner-facing wording, not the model's. What run_skill returns is
    // written for something that has to repair a skill — primitive counts,
    // rehearsal bookkeeping, advice on approaching an obstacle. The rule that
    // rewrites it is the runtime's, so this button and the robot's own say the
    // same thing.
    this.emit({ type: "chat", text: reply.plain });
    this.emit({ type: "skills", skills: sim.skills, unproven: sim.unproven });
  }
}
