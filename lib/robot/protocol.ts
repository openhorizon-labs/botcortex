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
};

export type PlanStep = {
  id: string;
  label: string;
  /** Which executor runs this step — mirrors the runtime hierarchy. */
  runner: "primitive" | "policy" | "vla" | "human";
};

/** Client → runtime */
export type ClientMessage =
  | { type: "chat"; text: string; dryRun: boolean }
  | { type: "run_skill"; name: string; dryRun: boolean }
  /** Sent once per page load so a refresh gives a clean scene. The runtime
   *  ignores it while busy, and backends with a physical arm never honour it. */
  | { type: "reset_sim" }
  | { type: "ping" };

/** Per-arm joint angles in degrees (gripper included), ~15 Hz. */
export type JointState = Record<string, Record<string, number>>;

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
    }
  /** Latch changes, including a stop file created outside this app. */
  | { type: "estop"; stopped: boolean }
  | { type: "status"; state: "idle" | "teaching" | "running"; detail?: string }
  | { type: "chat"; text: string }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "step"; id: string; state: "start" | "ok" | "fail"; error?: string }
  | { type: "skills"; skills: string[] }
  | { type: "state"; arms: JointState }
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

/**
 * A https page may not open ws:// to a LAN address (mixed content).
 * localhost is exempt; robot-served pages are same-origin so never hit this.
 */
export function mixedContentBlocked(host: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
  const bare = host.replace(/:\d+$/, "");
  return bare !== "localhost" && bare !== "127.0.0.1";
}
