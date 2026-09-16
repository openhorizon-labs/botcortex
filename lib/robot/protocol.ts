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
  /** The arm names this body has — ("right", "left") on an OpenArm, ("arm",)
   *  on a RoArm — so the UI can phrase suggestions for the body in front of
   *  the owner instead of for the one the copy was written on. */
  arms?: string[];
  /** The bodies this runtime can boot, for a picker. Only the browser sim
   *  sends one; a physical robot IS its platform. */
  catalog?: { name: string; displayName: string }[];
  /** The loaded model's kinematic tree and primitive geometry, for bodies
   *  the viewer has no URDF for. From the MuJoCo model itself. */
  kinematics?: Kinematics | null;
};

export type KinematicJoint = { name: string; type: "hinge" | "slide" | "other"; axis: number[]; pos: number[] };
export type KinematicGeom = {
  type: "sphere" | "capsule" | "cylinder" | "box" | "mesh";
  size: number[];
  pos: number[];
  quat: number[];
  rgba: number[];
  /** For type "mesh": the key into Kinematics.meshes. */
  mesh?: string;
};
export type KinematicBody = {
  name: string;
  parent: string;
  pos: number[];
  quat: number[];
  joints: KinematicJoint[];
  geoms: KinematicGeom[];
};
/** `drive[arm][joint]` says how runtime degrees reach each model joint:
 *  qpos = a * deg + b, measured off the runtime's own JointMap. */
export type Kinematics = {
  bodies: KinematicBody[];
  drive: Record<string, Record<string, { joint: string; a: number; b: number }[]>>;
  /**
   * Compiled meshes, as offsets into `meshBuffer` rather than arrays of
   * numbers. The Panda's visual meshes are 1.6 million floats; as JSON that
   * was a 12 MB string built in Python, parsed in JS and cloned to the main
   * thread on every boot. Vertices are float32 xyz, faces uint32 triangle
   * indices, laid out vertices-then-faces per mesh.
   */
  meshes?: Record<
    string,
    { vertexOffset: number; vertexCount: number; faceOffset: number; faceCount: number }
  >;
  /** The bytes those offsets index. Transferred from the worker, so it is
   *  owned by whoever received the hello. */
  meshBuffer?: ArrayBuffer;
};

export type PlanStep = {
  id: string;
  label: string;
  /** Which executor runs this step — mirrors the runtime hierarchy. */
  runner: "primitive" | "policy" | "vla" | "human";
};

/** One prior line of the conversation, as the owner saw it. */
export type ChatHistoryEntry = { role: "owner" | "robot"; text: string };

/** Client → runtime */
export type ClientMessage =
  /** `model` names the brain for THIS task; absent means the robot's own
   *  configured default. `history` is the conversation so far — each teach is
   *  a fresh model conversation, and without it "no, put it back" arrives
   *  meaning nothing. `runId` is minted by the client and binds every event
   *  the run emits to the conversation it started from — see the B01 note on
   *  RobotMessage. Older runtimes ignore it. */
  | { type: "chat"; text: string; dryRun: boolean; model?: string; history?: ChatHistoryEntry[]; runId?: string }
  | { type: "run_skill"; name: string; dryRun: boolean; runId?: string }
  /** Retry copying a saved skill to the account registry. Honoured by the
   *  browser sim, which holds the code; a runtime syncs on its own. */
  | { type: "sync_skill"; name: string }
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
      /** Of those, the ones saved but never seen to run to completion. The
       *  sidebar's promise is "your robot knows these", and a skill the agent
       *  wrote and could not make work is not something the robot knows —
       *  listing it beside the ones that do is the same lie as reporting a
       *  failed teach as done. Optional: an older runtime omits it, and then
       *  nothing is marked. */
      unproven?: string[];
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
  /* Execution events carry an optional `runId`, echoed from the client
     message that started the run (protocol version 2). The app files an
     event under the conversation that STARTED its run, not the one that
     happens to be open, so switching tasks mid-teach cannot move history.
     Absent on older runtimes, in which case events bind to the most recent
     run this client started. */
  | { type: "status"; state: "idle" | "teaching" | "running"; detail?: string; runId?: string }
  | { type: "chat"; text: string; runId?: string }
  | { type: "plan"; steps: PlanStep[]; runId?: string }
  | { type: "step"; id: string; state: "start" | "ok" | "fail"; error?: string; runId?: string }
  | { type: "skills"; skills: string[]; unproven?: string[] }
  /** Which model a teach actually ran on — echoed back, never assumed. */
  | { type: "model"; name: string; provider: string; runId?: string }
  /** The agent reaching into the runtime — emitted as it happens, so an owner
   *  can watch it read positions, write a skill, and run it. */
  | {
      type: "tool";
      id: string;
      name: string;
      input: Record<string, unknown>;
      runId?: string;
    }
  | { type: "tool_result"; id: string; ok: boolean; result: string; runId?: string }
  /** Joints, plus anything on the table that can move. */
  | { type: "state"; arms: JointState; objects?: SceneBodies }
  /** A saved skill's copy reaching the account registry, or failing to.
   *  Emitted by the runtime (agent.py) and was missing from this union
   *  entirely — a cross-repo shape mismatch that typechecked only because
   *  nothing handled it. */
  | { type: "sync"; skill: string; ok: boolean }
  /** Whether the robot's skills and episodes outlive this session, and
   *  whether the latest change reached that storage. `durable: false` with
   *  `unsaved: true` is the state the owner must see: something was taught
   *  and it exists only in memory. Emitted by the browser sim; a runtime's
   *  own disk is durable by construction and it need not send this. */
  | { type: "memory"; durable: boolean; unsaved: boolean; detail?: string }
  | { type: "pong" };

/** Bumped when a field is added to an existing message. Additive only: a
 *  version-1 peer ignores the new fields, so both directions keep working. */
export const PROTOCOL_VERSION = 2;

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const vector = (value: unknown, length: number) =>
  Array.isArray(value) && value.length === length && value.every(finite);
const scene = (value: unknown): boolean => record(value) && Object.values(value).every((body) =>
  record(body) && vector(body.position, 3) && vector(body.orientation, 4) &&
  vector(body.size_m, 3) && vector(body.colour, 4),
);

/** WebSocket JSON is untrusted at runtime, regardless of its TypeScript type. */
export function parseRobotMessage(raw: string): RobotMessage | null {
  let msg: unknown;
  try { msg = JSON.parse(raw); } catch { return null; }
  if (!record(msg)) return null;
  const optional = (key: string, valid: (value: unknown) => boolean) =>
    msg[key] === undefined || valid(msg[key]);
  const text = (value: unknown) => typeof value === "string";
  const bool = (value: unknown) => typeof value === "boolean";
  let valid = false;
  switch (msg.type) {
    case "hello":
      valid = record(msg.robot) && text(msg.robot.name) && text(msg.robot.platform) &&
        (msg.robot.version === undefined || text(msg.robot.version)) &&
        (msg.robot.gripper === undefined || (record(msg.robot.gripper) &&
          finite(msg.robot.gripper.minDeg) && finite(msg.robot.gripper.maxDeg) &&
          msg.robot.gripper.maxDeg > msg.robot.gripper.minDeg &&
          finite(msg.robot.gripper.travelM) && msg.robot.gripper.travelM > 0)) &&
        (msg.robot.arms === undefined || strings(msg.robot.arms)) &&
        (msg.robot.catalog === undefined || (Array.isArray(msg.robot.catalog) &&
          msg.robot.catalog.every((entry: unknown) => record(entry) && text(entry.name) && text(entry.displayName)))) &&
        (msg.robot.kinematics === undefined || msg.robot.kinematics === null ||
          (record(msg.robot.kinematics) && Array.isArray(msg.robot.kinematics.bodies) && record(msg.robot.kinematics.drive))) &&
        strings(msg.skills) && optional("unproven", strings) && optional("fixtures", scene) &&
        ["stopped", "resettable", "paired", "halfPaired"].every((key) => optional(key, bool));
      break;
    case "estop": valid = bool(msg.stopped); break;
    case "status": valid = ["idle", "teaching", "running"].includes(String(msg.state)) && optional("detail", text) && optional("runId", text); break;
    case "chat": valid = text(msg.text) && optional("runId", text); break;
    case "skills": valid = strings(msg.skills) && optional("unproven", strings); break;
    case "model": valid = text(msg.name) && text(msg.provider) && optional("runId", text); break;
    case "tool": valid = text(msg.id) && text(msg.name) && record(msg.input) && optional("runId", text); break;
    case "tool_result": valid = text(msg.id) && bool(msg.ok) && text(msg.result) && optional("runId", text); break;
    case "state":
      valid = record(msg.arms) && Object.values(msg.arms).every((joints) =>
        record(joints) && Object.values(joints).every(finite)) && optional("objects", scene);
      break;
    case "sync": valid = text(msg.skill) && bool(msg.ok); break;
    case "memory": valid = bool(msg.durable) && bool(msg.unsaved) && optional("detail", text); break;
    case "plan":
      valid = Array.isArray(msg.steps) && msg.steps.every((step) => record(step) &&
        text(step.id) && text(step.label) && ["primitive", "policy", "vla", "human"].includes(String(step.runner))) &&
        optional("runId", text);
      break;
    case "step":
      valid = text(msg.id) && ["start", "ok", "fail"].includes(String(msg.state)) && optional("error", text) &&
        optional("runId", text);
      break;
    case "pong": valid = true; break;
  }
  return valid ? msg as RobotMessage : null;
}

/**
 * Where a robot is, as a validated structure rather than a bare string.
 *
 * `normalizeHost` used to strip any scheme and path and let the PAGE decide
 * TLS: a https control room dialled `wss://` at everything, so a plain
 * `ws://localhost:9090` runtime — an address the helper accepted — was
 * unreachable with no explanation. An explicit scheme now wins; only an
 * address typed without one inherits the page's. Credentials, queries and
 * fragments are rejected outright: a robot address is a host and a port.
 */
export type RobotEndpoint = {
  /** `host` or `host:port`, IPv6 in brackets, exactly as a URL would print it. */
  host: string;
  /** TLS for both the WebSocket and the STOP endpoint. */
  secure: boolean;
  /** Whether the owner spelled the scheme out, or the page chose it. */
  explicitScheme: boolean;
};

const SCHEME = /^(wss?|https?):\/\//i;

/** A full account of why an address was refused, for the connect dialog. */
export function parseRobotEndpoint(
  raw: string,
  pageProtocol: string | undefined = typeof window !== "undefined" ? window.location.protocol : undefined,
): { ok: true; endpoint: RobotEndpoint } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter the robot's address." };
  const scheme = SCHEME.exec(trimmed)?.[1]?.toLowerCase() ?? null;
  const rest = scheme ? trimmed.slice(scheme.length + 3) : trimmed;
  // A trailing slash is what a copied URL carries; anything past it is not
  // an address. Refused rather than silently trimmed, so "thor.local/ws" —
  // someone pasting the socket path — is told what to remove.
  const slash = rest.indexOf("/");
  if (slash !== -1 && rest.slice(slash) !== "/") {
    return { ok: false, error: "Enter just the host and port — no path." };
  }
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  if (authority.includes("@")) return { ok: false, error: "Credentials do not belong in a robot address." };
  if (/[?#]/.test(authority)) return { ok: false, error: "Enter just the host and port — no query or fragment." };
  if (/\s/.test(authority)) return { ok: false, error: "Robot addresses cannot contain spaces." };
  const explicit = scheme !== null;
  const secure = explicit
    ? scheme === "wss" || scheme === "https"
    : pageProtocol === "https:";
  let url: URL;
  try {
    // Default ports may only be stripped for the scheme actually in use.
    url = new URL(`${secure ? "https" : "http"}://${authority}`);
  } catch {
    return { ok: false, error: "That is not a valid host or IP address." };
  }
  // The URL parser normalises (lower-cases, compresses IPv6, drops a default
  // port). Anything it had to REWRITE beyond that is suspect, and comparing
  // hosts case-insensitively catches the rest.
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    return { ok: false, error: "That is not a valid host or IP address." };
  }
  return { ok: true, endpoint: { host: url.host, secure, explicitScheme: explicit } };
}

/** Accepts "192.168.1.42:9090", "thor.local:9090", or a full URL. Kept for
 *  callers that want a display string; empty when the address is invalid. */
export function normalizeHost(raw: string): string {
  const parsed = parseRobotEndpoint(raw);
  return parsed.ok ? parsed.endpoint.host : "";
}

export function wsUrl(endpoint: RobotEndpoint): string {
  return `${endpoint.secure ? "wss" : "ws"}://${endpoint.host}/ws`;
}

export function httpUrl(endpoint: RobotEndpoint): string {
  return `${endpoint.secure ? "https" : "http"}://${endpoint.host}`;
}

/** Addresses that cannot hold a public certificate, so a https page can only
 *  ever reach them over plain ws:// — which the browser blocks. */
function isPrivateAddress(bare: string): boolean {
  const host = bare.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false; // secure context
  if (host === "127.0.0.1" || host === "[::1]") return false;
  if (host.endsWith(".local")) return true; // mDNS: thor.local
  // Private, link-local and unique-local IPv6, in the brackets the URL
  // parser leaves them in.
  if (host.startsWith("[")) return /^\[(fe80:|fc|fd)/i.test(host);
  return (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^127\./.test(host)
  );
}

/** The host without its port, brackets kept on an IPv6 literal. */
function bareHost(host: string): string {
  return host.startsWith("[") ? host.replace(/\]:\d+$/, "]") : host.replace(/:\d+$/, "");
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
 * contexts. An explicit plain scheme on a https page is blocked for every
 * other host: the browser will refuse it, so say so before trying.
 */
export function mixedContentBlocked(
  endpoint: RobotEndpoint | string,
  pageProtocol: string | undefined = typeof window !== "undefined" ? window.location.protocol : undefined,
): boolean {
  if (pageProtocol !== "https:") return false;
  const target = typeof endpoint === "string"
    ? { host: endpoint, secure: false, explicitScheme: false }
    : endpoint;
  const bare = bareHost(target.host);
  const loopback = bare === "localhost" || bare.endsWith(".localhost") || bare === "127.0.0.1" || bare === "[::1]";
  if (loopback) return false;
  if (target.explicitScheme) return !target.secure;
  return isPrivateAddress(bare);
}
