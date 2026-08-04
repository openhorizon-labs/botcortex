/**
 * Wire protocol between the web app and the BotCortex runtime.
 * The runtime (botcortex-runtime, FastAPI) implements the server side:
 * everything conversational rides the WebSocket at /ws; STOP is its own
 * REST endpoint (POST /stop) so it can never queue behind chat traffic.
 */

export type RobotInfo = {
  name: string;
  platform: string;
  version?: string;
  /** How to turn a gripper angle into finger travel, FROM the robot.
   *  The viewer used to hardcode this, which made it a third copy of the
   *  mapping jointmap.py owns — right for openarm_v1 and silently wrong for
   *  whatever platform comes next. */
  gripper?: { minDeg: number; maxDeg: number; travelM: number };
};

export type PlanStep = {
  id: string;
  label: string;
  /** Which executor runs this step — mirrors the runtime hierarchy. */
  runner: "primitive" | "policy" | "vla" | "human";
};

/** Client → runtime */
export type ClientMessage =
  /** `model` names the brain for THIS task; absent means the robot's own
   *  configured default. */
  | { type: "chat"; text: string; dryRun: boolean; model?: string }
  | { type: "run_skill"; name: string; dryRun: boolean }
  /** Sent once per page load so a refresh gives a clean scene. The runtime
   *  ignores it while busy, and backends with a physical arm never honour it. */
  | { type: "reset_sim" }
  | { type: "ping" };

/** Per-arm joint angles in degrees (gripper included), ~15 Hz. */
export type JointState = Record<string, Record<string, number>>;

/** A thing in the workcell, as the robot reports it. Metres, and full extents
 *  rather than MuJoCo's half-extents — the conversion happens once, runtime
 *  side, so the viewer never has to know that convention. */
export type SceneBody = {
  position: [number, number, number];
  /** wxyz, so a block knocked on its corner is drawn on its corner. */
  orientation: [number, number, number, number];
  size_m: [number, number, number];
  colour: [number, number, number, number];
};
export type SceneBodies = Record<string, SceneBody>;

/** Runtime → client */
export type RobotMessage =
  | {
      type: "hello";
      robot: RobotInfo;
      skills: string[];
      /** Whether the e-stop is already latched — a page loaded while the robot
       *  is stopped must show that, not a cheerful idle state. */
      stopped?: boolean;
      /** Whether this backend can be snapped home (sim/mock, never hardware). */
      resettable?: boolean;
      /** Whether this robot holds a key, so teaching spends BotCortex credit
       *  rather than the owner's own model provider. */
      paired?: boolean;
      /** Pointed at BotCortex with no key — a broken setup, not BYO. The
       *  runtime refuses to teach in this state; the app must not show a
       *  credit balance as though it were being spent. */
      halfPaired?: boolean;
      /** Immovable furniture — table, trays. Sent once because it never moves;
       *  the things that DO move ride the state stream instead. */
      fixtures?: SceneBodies;
    }
  /** Latch changes, including a stop file created outside this app. */
  | { type: "estop"; stopped: boolean }
  | { type: "status"; state: "idle" | "teaching" | "running"; detail?: string }
  | { type: "chat"; text: string }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "step"; id: string; state: "start" | "ok" | "fail"; error?: string }
  | { type: "skills"; skills: string[] }
  /** Which model a teach actually ran on — echoed back, never assumed. */
  | { type: "model"; name: string; provider: string }
  /** The agent reaching into the runtime — emitted as it happens, so an owner
   *  can watch it read positions, write a skill, and run it. */
  | {
      type: "tool";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; id: string; ok: boolean; result: string }
  /** Joints, plus anything on the table that can move. */
  | { type: "state"; arms: JointState; objects?: SceneBodies }
  /** A saved skill's copy reaching the account registry, or failing to.
   *  Emitted by the runtime (agent.py) and was missing from this union
   *  entirely — a cross-repo shape mismatch that typechecked only because
   *  nothing handled it. */
  | { type: "sync"; skill: string; ok: boolean }
  | { type: "pong" };

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** Accepts "192.168.1.42:9090", "thor.local:9090", or a full URL. */
export function normalizeHost(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?|wss?):\/\//, "")
    .replace(/\/.*$/, "");
}

export function wsUrl(host: string): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  return `${secure ? "wss" : "ws"}://${host}/ws`;
}

export function httpUrl(host: string): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  return `${secure ? "https" : "http"}://${host}`;
}

/** Addresses that cannot hold a public certificate, so a https page can only
 *  ever reach them over plain ws:// — which the browser blocks. */
function isPrivateAddress(bare: string): boolean {
  const host = bare.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false; // secure context
  if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return false;
  if (host.endsWith(".local")) return true; // mDNS: thor.local
  return (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^127\./.test(host)
  );
}

/**
 * A https page may not open ws:// to a LAN address (mixed content).
 *
 * The test is whether the target could hold a CERTIFICATE, not whether it is
 * localhost. This used to block every host but localhost, which was right for
 * a robot on the LAN serving plain ws and wrong for anything public: wsUrl()
 * already picks wss:// on a https page, so a hosted robot or the relay is a
 * perfectly ordinary secure connection — and would have been refused before it
 * was ever attempted.
 *
 * localhost and 127.0.0.1 are exempt because browsers treat them as secure
 * contexts. Robot-served pages are same-origin, so they never reach here.
 */
export function mixedContentBlocked(host: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
  return isPrivateAddress(host.replace(/:\d+$/, ""));
}
