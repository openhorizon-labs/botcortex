"use client";

import { useRouter } from "next/navigation";

import { BrowserSimTransport } from "@/lib/robot/browser-sim/transport";
import { Outbox, type OutboxState, localStorageJournal } from "@/lib/robot/outbox";
import { AUTO_CONNECT_WITHIN_MS, ageMs } from "@/lib/robot/seen";
import { newlyProven } from "@/lib/robot/proven";
import { accountFetcher } from "@/lib/robot/account";
import { ConversationDraft } from "@/lib/robot/conversation-draft";
import { ConnectionHealth, PING_INTERVAL_MS } from "@/lib/robot/connection-health";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type ConnectionStatus,
  type JointState,
  type RobotEndpoint,
  type RobotInfo,
  type RobotMessage,
  type SceneBodies,
  type ClientMessage,
  httpUrl,
  mixedContentBlocked,
  parseRobotEndpoint,
  parseRobotMessage,
  wsUrl,
} from "@/lib/robot/protocol";

const STORAGE_KEY = "botcortex.robot";
/** Which simulated body the owner last chose. A preference, not a pairing. */
const SIM_PLATFORM_KEY = "botcortex.simPlatform";
/** Retries for a robot that has ALREADY answered once — a Wi-Fi blip, a
 *  runtime restart. Patience is right there: the robot is real and coming back. */
const MAX_RETRIES = 5;
/** Retries before the FIRST hello: none. Nothing has proved the address is
 *  there, a robot that IS there answers at once, and five attempts at three
 *  seconds left a new account watching "connecting…" for nineteen seconds with
 *  no idea whether the product was working. Failing fast is what surfaces the
 *  in-browser robot, which is the answer for anyone without hardware. */
const MAX_RETRIES_BEFORE_FIRST_HELLO = 0;
/** Bounded exponential backoff between retries: 1, 2, 4, 8, 15 seconds.
 *  A fixed three seconds hammered a rebooting runtime at the worst moment
 *  and gave up on it just as it came back. */
const backoffMs = (attempt: number) => Math.min(15_000, 1000 * 2 ** (attempt - 1));
/** How long one attempt may sit in TCP connect before we call it dead.
 *
 *  Cutting the retry COUNT was not enough, and it is worth recording why: an
 *  address that is switched off drops packets rather than refusing them, so
 *  the socket does not error — it hangs until the browser's own connect
 *  timeout, tens of seconds later. The count never dominated; this does. */
const CONNECT_DEADLINE_MS = 4000;
/** Liveness thresholds live in connection-health.ts: idle ping responses
 *  and a streaming backend's joint telemetry are checked independently. */
/** The api caps history at 500 rows per request (no cursor yet). Asking for
 *  the cap and noticing when it is hit is what "older events not loaded"
 *  rests on until pagination lands on the api side. */
const HISTORY_LIMIT = 500;

export type ChatMessage = {
  id: string;
  from: "you" | "robot";
  text: string;
  at: number;
};

/**
 * The e-stop latch as this app can vouch for it (audit B07).
 *
 * "latched" is a runtime acknowledgement — an estop event, a hello that says
 * so, or a 200 from the STOP endpoint. "pending" is a request in flight.
 * "unknown" is a latch that was confirmed and then the socket went away:
 * the CLI or another operator may have cleared it, and this tab cannot say.
 */
export type StopState = "clear" | "pending" | "latched" | "unknown";

/** Whether the robot's skills and episodes outlive this session. */
export type MemoryState = {
  durable: boolean;
  unsaved: boolean;
  detail: string | null;
};

/** The run the robot is on, and the task it was started from (audit B01). */
export type ActiveRun = {
  runId: string;
  conversationId: string | null;
};

type RobotContextValue = {
  status: ConnectionStatus;
  robot: RobotInfo | null;
  skills: string[] | null;
  /** Saved, never seen to run. See RobotMessage's `unproven`. */
  unproven: string[];
  host: string | null;
  error: string | null;
  /** Robot-side activity: idle / teaching / running. */
  activity: string;
  /** What is being checked this moment, while a run is rehearsed and the arm
   *  has not moved yet ("Checking step 7: moving the arm"). Null otherwise. */
  working: string | null;
  lastChat: string | null;
  /** Full conversation for this session, oldest first. */
  messages: ChatMessage[];
  /** Latest joint state, written at ~15 Hz. A ref on purpose: the 3D scene
   *  reads it per-frame; routing it through React state would re-render the
   *  whole app at stream rate. */
  jointStateRef: React.RefObject<JointState | null>;
  /** Blocks and anything else that moves, ~15 Hz. */
  objectsRef: React.RefObject<SceneBodies | null>;
  /** Table and trays — set once from hello. */
  fixturesRef: React.RefObject<SceneBodies | null>;
  connect: (rawHost: string) => void;
  disconnect: () => void;
  sendChat: (text: string, dryRun: boolean, model?: string | null) => boolean;
  runSkill: (name: string, dryRun: boolean) => boolean;
  /** Delete a skill that never ran successfully. The robot decides and
   *  answers in chat; a proven skill is refused because it is published. */
  deleteSkill: (name: string) => boolean;
  /** Stop the agent mid-task WITHOUT latching the e-stop — "not that task",
   *  not "the arm is about to hit something". False when nothing was running,
   *  or when this robot cannot be interrupted (a real runtime authors on the
   *  robot, and the wire protocol has no word for this yet). */
  interrupt: () => boolean;
  /** A skill that has JUST been seen to work for the first time — the moment
   *  worth sharing — or null. Cleared by `dismissProven`. */
  justProven: { name: string; platform: string } | null;
  dismissProven: () => void;
  /** Whether `interrupt` would do anything right now, for a control that
   *  should not offer itself when it cannot act. */
  interruptible: boolean;
  stop: () => Promise<boolean>;
  /** True while the e-stop is latched — motion stays blocked until cleared. */
  stopped: boolean;
  /** The latch with its uncertainty kept: see StopState. */
  stopState: StopState;
  /** Clears the e-stop file. Deliberately separate from stop() so the UI can
   *  make un-blocking a two-step, considered action. */
  resetStop: () => Promise<boolean>;
  /** The owner's threads, most recently active first. */
  conversations: Conversation[];
  /** Which thread the chat pane is showing. */
  conversationId: string | null;
  /** Starts a NEW thread. Additive — the previous one is kept, which is the
   *  whole reason threads exist. */
  newConversation: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  /** Boot the robot INSIDE this tab — no runtime, no hardware. `platform`
   *  picks a body from the runtime's catalog and is remembered; omitted, the
   *  last choice (or the default) boots. */
  connectBrowserSim: (platform?: string) => Promise<void>;
  /** Which stage the in-page robot is at while it loads, or null. */
  simBooting: string | null;
  /** Which model the last teach REALLY ran on — echoed by the robot, never
   *  assumed, because it is what the account was billed for. */
  ranModel: string | null;
  /** Remaining BotCortex credit, or null when signed out / unreachable. */
  credit: Credit | null;
  /** The owner has read the welcome dialog: tell the api, stop showing it. */
  acknowledgeWelcome: () => void;
  /** Which wallet the connected robot teaches from — null until it says.
   *  "half" is a broken setup (pointed at BotCortex, no key): the runtime
   *  refuses to teach, so showing a balance would be a lie. */
  pairing: "paired" | "byo" | "half" | null;
  /** What the agent is doing right now, oldest first. */
  toolCalls: ToolCall[];
  /** The run in progress (or the last one), and the task it belongs to —
   *  so a running task stays discoverable from any view. */
  activeRun: ActiveRun | null;
  /** Writes to the transcript store that have not landed, and failures. */
  persistence: OutboxState;
  retryPersistence: () => Promise<void>;
  /** True when the loaded task hit the api's row cap, so older events exist
   *  that this tab has not loaded. */
  historyTruncated: boolean;
  /** How the connected robot keeps its files. Null until it says. */
  memory: MemoryState | null;
  /** Skills saved on the robot whose copy did not reach the registry. */
  syncFailures: string[];
  retrySync: (name: string) => boolean;
  /** Socket open, nothing heard for a while: the arm on screen is old news. */
  telemetryStale: boolean;

  /* Session-scoped UI choices. They live here rather than in the page because
     the first message navigates /app -> /app/tasks/<id>, which remounts the
     page — local state would silently snap back, so an owner who switched off
     dry run or picked a model would quietly lose it on their next send. */
  simOpen: boolean;
  setSimOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dryRun: boolean;
  setDryRun: React.Dispatch<React.SetStateAction<boolean>>;
  model: string | null;
  setModel: React.Dispatch<React.SetStateAction<string | null>>;
};

export type Credit = {
  balanceMicros: number;
  spentMicros: number;
  grantedMicros: number;
  /** Formatted by the api, which owns how money is written. Balances floor to
   *  the cent and spend ceils, so neither ever flatters the account. */
  display: string;
  spentDisplay: string;
  usedDisplay: string;
  grantedDisplay: string;
  /** The welcome credit, while the owner has not been told about it yet.
   *  The api keeps that fact per ACCOUNT, so the dialog appears once on
   *  whatever device they first sign in from, and never again. */
  welcome?: { amountMicros: number; display: string } | null;
};

/** One reach into the runtime, from call to result. Finished calls are also
 *  persisted with the conversation and restored when the task is opened. */
export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  ok?: boolean;
  at: number;
};

export type Conversation = {
  id: string;
  title: string | null;
  /** The body the task was taught on; null for tasks from before this was recorded. */
  platform: string | null;
  updatedAt: string;
  messages: number;
};

/**
 * One run's binding to the task it started from.
 *
 * Made the instant the owner presses send, BEFORE the thread exists on the
 * api: `thread` resolves to the id once the create round-trip lands, and
 * `epoch` is the selection counter at that moment, so "is this run's task
 * the one on screen" can be answered synchronously while the id is still
 * in flight. Events file against `thread`, never against whatever the
 * sidebar has selected by the time they arrive.
 */
type RunBinding = {
  runId: string;
  thread: Promise<string>;
  threadId: string | null;
  epoch: number;
};

const RobotContext = createContext<RobotContextValue | null>(null);

export function useRobot() {
  const ctx = useContext(RobotContext);
  if (!ctx) throw new Error("useRobot must be used inside RobotProvider");
  return ctx;
}

export function RobotProvider({ children, accountId = null }: { children: React.ReactNode; accountId?: string | null }) {
  // The provider lives in the layout, so it survives moving between /app and
  // /app/tasks/[id]. That is precisely why the "a task was just born, give it
  // a URL" navigation belongs HERE: the page component remounts across those
  // segments, so any ref it kept to spot the transition resets — and on
  // landing at /app with the previous task still open, it would send you
  // straight back to the task you had just left.
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [robot, setRobot] = useState<RobotInfo | null>(null);
  const [skills, setSkills] = useState<string[] | null>(null);
  const [unproven, setUnproven] = useState<string[]>([]);
  const [justProven, setJustProven] = useState<{ name: string; platform: string } | null>(null);
  /** Last unproven list, to notice a skill LEAVING it. Null until a hello has
   *  set the baseline: everything already proven when a robot connects is old
   *  news, and offering to share forty skills on connect would be noise. */
  const unprovenRef = useRef<string[] | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState("idle");
  const [working, setWorking] = useState<string | null>(null);
  const [lastChat, setLastChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stopState, setStopState] = useState<StopState>("clear");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  /** Tasks this tab has already asked the api to title. */
  const titledRef = useRef<Set<string>>(new Set());
  const [credit, setCredit] = useState<Credit | null>(null);
  const [pairing, setPairing] = useState<RobotContextValue["pairing"]>(null);
  /** The model the last teach actually ran on, as the robot reported it. */
  const [ranModel, setRanModel] = useState<string | null>(null);
  const [memory, setMemory] = useState<MemoryState | null>(null);
  const [syncFailures, setSyncFailures] = useState<string[]>([]);
  const [telemetryStale, setTelemetryStale] = useState(false);
  const [historyTruncated, setHistoryTruncated] = useState(false);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [persistence, setPersistence] = useState<OutboxState>({ pending: 0, failed: 0, lastFailure: null, stalled: 0 });
  /** What is on the table. Refs for the same reason joints are: the 3D scene
   *  reads them every frame, and routing 15 Hz through React state would
   *  re-render the whole app at stream rate. */
  const objectsRef = useRef<SceneBodies | null>(null);
  const fixturesRef = useRef<SceneBodies | null>(null);
  /** Whether this address has ever said hello — see the retry budgets above. */
  const greetedRef = useRef(false);
  /** Set when the robot IS this tab. Mutually exclusive with wsRef. */
  const simRef = useRef<BrowserSimTransport | null>(null);
  const [simBooting, setSimBooting] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  /**
   * The authoritative list of what is ON SCREEN, written synchronously.
   *
   * `tool` and `tool_result` land milliseconds apart — often before React has
   * flushed a render — so a ref synced from state in an effect is still empty
   * when the result arrives, and the call's arguments (the authored code, the
   * whole reason to keep a trace) are lost. State mirrors this for rendering;
   * this is what the code reads.
   */
  const toolCallsRef = useRef<ToolCall[]>([]);
  const putToolCalls = useCallback((next: ToolCall[]) => {
    toolCallsRef.current = next;
    setToolCalls(next);
  }, []);
  /** Every live call of every run, whether or not its task is on screen, so
   *  a result arriving for a task the owner has switched away from can still
   *  be filed with its arguments. */
  const liveCallsRef = useRef<Map<string, { call: ToolCall; run: RunBinding | null }>>(new Map());
  const [simOpen, setSimOpen] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [model, setModel] = useState<string | null>(null);
  // Read inside send(), which is memoised with no deps — a stale closure would
  // bill whatever model was picked when the provider first mounted.
  const modelRef = useRef<string | null>(null);
  modelRef.current = model;
  /** `send` is defined further down and newConversation needs it. Assigned
   *  during render rather than in an effect: it is a stable callback over
   *  refs, and a fresh task must be able to reset the scene on the very first
   *  click rather than the second. */
  const sendRef = useRef<((msg: ClientMessage) => boolean) | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  /** Read by persist(), which is built once and would otherwise capture the
   *  first render's (null) thread id forever. */
  const conversationIdRef = useRef<string | null>(null);

  /** Set the instant anything is said, synchronously, so the rehydrate below
   *  can tell whether it would be trampling a live conversation. */
  const spokeRef = useRef(false);
  const historyVersionRef = useRef(0);

  /** The outbox outlives every callback below and reports into state. */
  const accountLifetimeRef = useRef(new AbortController());
  const draftsRef = useRef(new Set<ConversationDraft>());
  const outboxRef = useRef<Outbox | null>(null);
  const reportPersistence = useCallback(() => {
    const state = outboxRef.current?.state ?? { pending: 0, failed: 0, lastFailure: null, stalled: 0 };
    const drafts = [...draftsRef.current];
    // A draft that failed is still retrying on its own (ConversationDraft):
    // it counts as pending-and-stalled, the way a stalled write does, not
    // as lost.
    const stalledDrafts = drafts.filter((draft) => draft.failure).length;
    setPersistence({
      pending: state.pending + drafts.filter((draft) => draft.pending || draft.failure).length,
      failed: state.failed,
      lastFailure: drafts.find((draft) => draft.failure)?.failure ?? state.lastFailure,
      stalled: state.stalled + stalledDrafts,
    });
  }, []);
  const accountChanged = useCallback(() => {
    accountLifetimeRef.current.abort();
    outboxRef.current?.dispose();
    for (const draft of draftsRef.current) draft.dispose();
    simRef.current?.close();
    wsRef.current?.close();
    // Re-enter the server auth gate rather than carrying the previous owner's
    // scene, history or retry queue into the replacement session.
    window.location.reload();
  }, []);
  const scopedFetch = useCallback((url: string, init: RequestInit = {}) =>
    accountFetcher(accountId, accountLifetimeRef.current.signal, accountChanged)(url, init),
  [accountId, accountChanged]);
  // Journalled per account, so a reload (or a dev server restart mid-teach)
  // picks the queue back up instead of showing "6 unsaved" and forgetting.
  // Signed out there is no account to file under, and nothing to save.
  const makeOutbox = useCallback(() => new Outbox({
    onChange: reportPersistence,
    fetch: scopedFetch,
    journal: accountId ? localStorageJournal(`botcortex.outbox.${accountId}`) : undefined,
  }), [reportPersistence, scopedFetch, accountId]);
  if (!outboxRef.current) {
    outboxRef.current = makeOutbox();
  }
  const retryPersistence = useCallback(async () => {
    await Promise.all([...draftsRef.current].filter((draft) => draft.failure).map((draft) => draft.retry()));
    await outboxRef.current!.retryFailed();
  }, []);

  useEffect(() => {
    // React Strict Mode replays setup/cleanup during development.
    if (accountLifetimeRef.current.signal.aborted) accountLifetimeRef.current = new AbortController();
    if (!outboxRef.current || outboxRef.current.disposed) outboxRef.current = makeOutbox();
    outboxRef.current.resume();
    // The api coming back is not something the owner should have to notice:
    // a stalled queue retries the moment the network or the tab returns.
    const wake = () => outboxRef.current?.nudge();
    const visible = () => { if (document.visibilityState === "visible") wake(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", visible);
      accountLifetimeRef.current.abort();
      outboxRef.current?.dispose();
      for (const draft of draftsRef.current) draft.dispose();
      draftsRef.current.clear();
    };
  }, [makeOutbox]);

  /** Run bindings: the one in progress, and every one by id for events that
   *  name theirs (protocol v2). */
  const activeRunRef = useRef<RunBinding | null>(null);
  const runsRef = useRef<Map<string, RunBinding>>(new Map());

  /** Persist one message under an explicit thread. Fire-and-forget: the
   *  transcript is a record, and losing a line of it must never interrupt
   *  teaching a robot — but losing it SILENTLY is what the outbox ends. */
  const persist = useCallback(async (msg: ChatMessage, thread: Promise<string>) => {
    let id: string;
    try {
      // Creates the thread if this is the first thing said in it. Dropping the
      // message when no thread existed yet is how the opening line of a
      // conversation went missing.
      id = await thread;
    } catch {
      // The owning provider was disposed. Transient creation failures keep
      // this binding pending until its visible retry succeeds.
      return;
    }
    if (accountLifetimeRef.current.signal.aborted) return;
    const saved = await outboxRef.current!.post(msg.id, "/api/messages", {
      id: msg.id,
      conversationId: id,
      author: msg.from,
      text: msg.text,
    });
    if (saved) void refreshConversationsRef.current();
    // A long opening message makes a poor sidebar row, so the api is asked to
    // shorten it — after the message is safely stored, never in its way, and
    // once per task. The api decides whether there is anything to do (a short
    // message is its own title) and the list is re-read only if it changed.
    if (saved && msg.from === "you" && msg.text.trim().length > 40 && !titledRef.current.has(id)) {
      titledRef.current.add(id);
      void fetch(`/api/conversations/${encodeURIComponent(id)}/title`, { method: "POST" })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { changed?: boolean } | null) => { if (body?.changed) void refreshConversationsRef.current(); })
        .catch(() => {});
    }
  }, []);

  /** Store a finished tool call alongside the conversation, so reopening a
   *  task shows HOW a skill was authored and not merely that it was. */
  const persistTool = useCallback(
    async (call: { id: string; result?: string; ok?: boolean }, live: ToolCall, thread: Promise<string>, runId?: string) => {
      let id: string;
      try {
        id = await thread;
      } catch {
        return;
      }
      if (accountLifetimeRef.current.signal.aborted) return;
      // Call ids are scoped to a run, not a whole conversation. Include both
      // identities so a later run may safely reuse the runtime's call id.
      const rowId = `${id}:${runId ?? "legacy"}:${call.id}`;
      await outboxRef.current!.post(rowId, "/api/messages", {
        id: rowId,
        conversationId: id,
        author: "robot",
        kind: "tool",
        text: live.name,
        payload: {
          name: live.name,
          input: live.input,
          result: call.result,
          ok: call.ok,
        },
      });
    },
    [],
  );

  /** open() is built once, so it reaches these through refs. */
  const putToolCallsRef = useRef(putToolCalls);
  useEffect(() => {
    putToolCallsRef.current = putToolCalls;
  }, [putToolCalls]);

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionEpochRef = useRef(0);
  const retriesRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const jointStateRef = useRef<JointState | null>(null);
  /** One sim reset per page load — see ws.onopen. */
  const didResetSimRef = useRef(false);
  /** One history load per mount, so React's double-invoked dev effects don't
   *  rehydrate the transcript twice. */
  const didLoadHistoryRef = useRef(false);
  /** Was the robot working on the last status? Drives the sim reveal. */
  const workingRef = useRef(false);
  /** The validated address of the robot on the socket, for STOP over REST. */
  const endpointRef = useRef<RobotEndpoint | null>(null);
  /** Once the owner has chosen a robot (or the sim) by hand, late automatic
   *  discovery — the saved host, the account's paired list — must not
   *  override it (audit B06). */
  const manualChoiceRef = useRef(false);
  /** Liveness bookkeeping for the socket. */
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const threadEpochRef = useRef(0);
  const creatingRef = useRef<Promise<string> | null>(null);
  const selectThread = useCallback((id: string | null) => {
    threadEpochRef.current++;
    creatingRef.current = null;
    conversationIdRef.current = id;
    setConversationId(id);
  }, []);

  /**
   * The thread to file the next message under, made on demand.
   *
   * Lazy on purpose. Creating one eagerly on mount left an empty thread behind
   * every single load — and since the sidebar hides empty threads, those
   * orphans were invisible while they piled up.
   */
  const ensureConversation = useCallback(async (): Promise<string> => {
    const existing = conversationIdRef.current;
    if (existing) return existing;
    // One in-flight create at a time: two messages sent together must land in
    // the same thread, not race into two.
    if (!creatingRef.current) {
      const epoch = threadEpochRef.current;
      const draft = new ConversationDraft(async (signal) => {
        const res = await scopedFetch("/api/conversations", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          // Filed under the body it is being taught on.
          body: JSON.stringify({ platform: platformRef.current }),
        });
        if (!res.ok) throw new Error("could not start a conversation");
        const { id } = await res.json();
        if (typeof id !== "string" || !id) throw new Error("No task id returned");
        return id;
      }, reportPersistence);
      draftsRef.current.add(draft);
      const creation = draft.thread.then((id) => {
        draftsRef.current.delete(draft);
        reportPersistence();
        // Still file the original message, but do not navigate back after the
        // owner has selected another task while this POST was in flight.
        if (threadEpochRef.current !== epoch || accountLifetimeRef.current.signal.aborted) return id;
        conversationIdRef.current = id;
        setConversationId(id);
        // The native History API, NOT router.replace.
        //
        // /app and /app/tasks/[id] are different route segments, so a router
        // navigation unmounts one page component and mounts the other —
        // fetching an RSC payload and tearing down the whole workspace,
        // 3D view included, to render the same component with an id. What an
        // owner saw was the app blink the instant they pressed send.
        //
        // Both URLs render <Workspace> under the same layout, and the id
        // already lives in this provider, so there is nothing to fetch and
        // nothing to remount: rewrite the address bar and stay put. Next
        // supports this and keeps usePathname in sync — see
        // node_modules/next/dist/docs "Native History API". A reload or a real
        // navigation still resolves the URL through the server route.
        window.history.replaceState(null, "", `/app/tasks/${id}`);
        return id;
      });
      creatingRef.current = creation;
      const settled = () => {
        if (creatingRef.current === creation) creatingRef.current = null;
      };
      void creation.then(settled, settled);
      void draft.retry();
    }
    return creatingRef.current;
  }, [scopedFetch, reportPersistence]);

  /**
   * Bind a new run to the task on screen, right now.
   *
   * The thread promise is captured HERE, so every event the run emits files
   * against the task the owner pressed send in — even after they open
   * another one. Resolution is recorded so later events can compare ids
   * synchronously.
   */
  const startRun = useCallback((): RunBinding => {
    const thread = ensureConversation();
    const run: RunBinding = {
      runId: crypto.randomUUID(),
      thread,
      threadId: conversationIdRef.current,
      epoch: threadEpochRef.current,
    };
    void thread.then((id) => { run.threadId = id; }, () => {});
    runsRef.current.set(run.runId, run);
    activeRunRef.current = run;
    // Bounded: only the runs that could still have late events matter.
    if (runsRef.current.size > 20) {
      const oldest = runsRef.current.keys().next().value;
      if (oldest) runsRef.current.delete(oldest);
    }
    setActiveRun({ runId: run.runId, conversationId: run.threadId });
    void thread.then((id) => setActiveRun((current) =>
      current?.runId === run.runId ? { runId: run.runId, conversationId: id } : current), () => {});
    return run;
  }, [ensureConversation]);

  /** Which run an event belongs to: the one it names, else the one in progress. */
  const runFor = useCallback((runId?: string): RunBinding | null | undefined => {
    // Missing id is legacy protocol. An explicitly unknown id is UNBOUND,
    // never permission to file someone else's event into the current task.
    if (runId !== undefined) return runsRef.current.get(runId);
    return activeRunRef.current;
  }, []);

  /** Whether a run's task is the one on screen — answerable before the
   *  thread id exists, via the selection epoch. */
  const onScreen = useCallback((run: RunBinding | null): boolean => {
    if (!run) return true;
    if (run.threadId) return run.threadId === conversationIdRef.current;
    return run.epoch === threadEpochRef.current;
  }, []);

  const appendTo = useCallback(
    (from: ChatMessage["from"], text: string, run: RunBinding | null) => {
      // crypto.randomUUID, not a timestamp+index: the id is the dedup key on
      // the server, so it has to survive a reload and a retried POST.
      spokeRef.current = true;
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        from,
        text,
        at: Date.now(),
      };
      if (onScreen(run)) {
        historyVersionRef.current++;
        setMessages((prev) => [...prev, msg]);
      }
      void persist(msg, run ? run.thread : ensureConversation());
    },
    [persist, ensureConversation, onScreen],
  );

  const refreshCredit = useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) setCredit((await res.json()) as Credit);
    } catch {
      /* signed out or offline — the sidebar just omits the figure */
    }
  }, []);

  const acknowledgeWelcome = useCallback(() => {
    // Cleared here first: the dialog must close on the click, not on the
    // round-trip. If the request is lost the api still has it as unseen and
    // the owner sees it once more on the next visit, which is the safe way
    // round for a message about money they were given.
    setCredit((current) => (current ? { ...current, welcome: null } : current));
    void fetch("/api/credits/welcome/seen", { method: "POST" }).catch(() => {});
  }, []);

  /** Refreshed from the teach-finished event, not a timer: credit only moves
   *  when the RUNTIME spends it, which is not when a message posts. */
  const refreshCreditRef = useRef(refreshCredit);
  useEffect(() => {
    refreshCreditRef.current = refreshCredit;
  }, [refreshCredit]);

  useEffect(() => {
    void refreshCredit();
  }, [refreshCredit]);

  /** The connected robot's body, for the task list and new tasks. A ref,
   *  because refreshConversations is built once and reached through refs. */
  const platformRef = useRef<string | null>(null);
  const refreshConversations = useCallback(async (): Promise<Conversation[]> => {
    try {
      // A task is a conversation with ONE robot (Sai, Sep 16): the sidebar
      // lists the connected body's tasks, and with no robot connected it
      // lists nothing — there is no robot for a task to belong to.
      const platform = platformRef.current;
      if (!platform) {
        setConversations([]);
        return [];
      }
      const res = await fetch(`/api/conversations?platform=${encodeURIComponent(platform)}`);
      if (!res.ok) return [];
      const { conversations: rows } = (await res.json()) as { conversations: Conversation[] };
      setConversations(rows);
      return rows;
    } catch {
      return [];
    }
  }, []);

  /** persist() is built once, so it reaches the latest refresh through a ref. */
  const refreshConversationsRef = useRef(refreshConversations);
  useEffect(() => {
    refreshConversationsRef.current = refreshConversations;
  }, [refreshConversations]);

  const loadMessages = useCallback(async (id: string) => {
    const version = ++historyVersionRef.current;
    try {
      const res = await fetch(`/api/messages?conversation=${encodeURIComponent(id)}&limit=${HISTORY_LIMIT}`);
      if (!res.ok) return;
      const { messages: history } = (await res.json()) as {
        messages: {
          id: string;
          author: ChatMessage["from"];
          kind?: string;
          text: string;
          payload?: {
            name: string;
            input: Record<string, unknown>;
            result?: string;
            ok?: boolean;
          } | null;
          createdAt: string;
        }[];
      };
      // An older request must not replace a newly selected task or live words.
      if (version !== historyVersionRef.current || conversationIdRef.current !== id) return;
      setHistoryTruncated(history.length >= HISTORY_LIMIT);
      // Words and workings come back on the same query, split apart here:
      // the transcript renders them merged on timestamp.
      setMessages(
        history
          .filter((m) => m.kind !== "tool")
          .map((m) => ({
            id: m.id,
            from: m.author,
            text: m.text,
            at: new Date(m.createdAt).getTime(),
          })),
      );
      putToolCalls(
        history
          .filter((m) => m.kind === "tool" && m.payload)
          .map((m) => ({
            id: m.id,
            name: m.payload!.name,
            input: m.payload!.input,
            result: m.payload!.result,
            ok: m.payload!.ok,
            at: new Date(m.createdAt).getTime(),
          })),
      );
    } catch {
      /* signed out, or the api is unreachable */
    }
  }, [putToolCalls]);

  const openConversation = useCallback(
    async (id: string) => {
      selectThread(id);
      setMessages([]);
      setHistoryTruncated(false);
      // Cleared so the previous task's workings never bleed through; the
      // load below refills them from what was stored.
      putToolCalls([]);
      await loadMessages(id);
    },
    [loadMessages, selectThread, putToolCalls],
  );

  /**
   * Starts a fresh thread. ADDITIVE — this used to delete the transcript
   * outright, so clicking "New task" cost you every previous conversation.
   */
  const newConversation = useCallback(async () => {
    historyVersionRef.current++;
    setMessages([]);
    setHistoryTruncated(false);
    putToolCalls([]);
    // Nothing is created until something is said — so clicking "New task"
    // twice cannot leave two empty threads behind.
    selectThread(null);
    // And the WORKCELL starts over too. Without this a new task inherits
    // whatever the last one left behind — the arm somewhere over the table,
    // the red block wherever it was dropped — so "put the red block in the
    // tray" means something different every time, and the owner is looking at
    // a scene nobody set up while reading an empty transcript. The runtime
    // refuses this while it is busy, and hardware backends never honour it at
    // all: there is no resetting a real arm by teleporting it.
    sendRef.current?.({ type: "reset_sim" });
    await refreshConversations();
  }, [refreshConversations, selectThread, putToolCalls]);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!response.ok) return;
      } catch {
        return;
      }
      const rows = await refreshConversations();
      if (conversationIdRef.current === id) {
        // Land somewhere real rather than on a thread that no longer exists.
        //
        // The condition here used to include `!conversationIdRef.current`,
        // which cannot hold inside a branch that just compared it to a
        // non-empty id — so the "open the next thread" arm was unreachable and
        // deleting the open task ALWAYS dumped you on a blank one, with the
        // URL still pointing at the id you had just deleted.
        const next = rows.find((row) => row.id !== id);
        if (next) {
          await openConversation(next.id);
          router.replace(`/app/tasks/${next.id}`);
        }
        else {
          await newConversation();
          router.replace("/app");
        }
      }
    },
    [refreshConversations, openConversation, newConversation, router],
  );

  // The URL decides which task is open. /app is a fresh one — it stays blank
  // until something is said, and then gets an id and a URL of its own.
  //
  // Loading a task is skipped if the owner has already typed. It takes a
  // round-trip, and someone who typed inside that window had their message
  // filed into a NEW task by ensureConversation and then wiped from the pane
  // by this load — it vanished from view and landed somewhere they were not
  // looking. Being quick to restore history is not worth losing what someone
  // just said.
  useEffect(() => {
    if (didLoadHistoryRef.current) return;
    didLoadHistoryRef.current = true;
    void refreshConversations();
  }, [refreshConversations]);

  /**
   * Everything the app does with a runtime message, independent of how it
   * arrived.
   *
   * Extracted because the browser sim delivers the SAME messages over an
   * in-process channel rather than a socket. Two copies of this switch is
   * how the two backends would start behaving differently — and the whole
   * claim is that they do not.
   */
  const handleMessage = useCallback((msg: RobotMessage) => {
      switch (msg.type) {
        case "hello":
          greetedRef.current = true;
          // Furniture arrives once and never changes; a robot with no workcell
          // sends none, and the viewer draws just the arm as before. Stored
          // BEFORE the robot state changes: the workspace phrases its
          // suggestions from the fixtures when the robot changes, and used
          // to read the previous body's (or none) — "the right tray" on a
          // bench that also has a pocket.
          fixturesRef.current = msg.fixtures ?? null;
          setRobot(msg.robot);
          // The task list is this robot's now.
          if (platformRef.current !== (msg.robot.platform ?? null)) {
            platformRef.current = msg.robot.platform ?? null;
            void refreshConversationsRef.current();
          }
          setSkills(msg.skills);
          unprovenRef.current = msg.unproven ?? [];
          setJustProven(null);
          setUnproven(msg.unproven ?? []);
          // A page loaded while the robot is already stopped must say so.
          setStopState(msg.stopped ? "latched" : "clear");
          // Older runtimes send neither field. Treating that as "paired"
          // would reinstate exactly the silent lie this exists to end, so
          // absent means unknown and the credit row stays quiet.
          setPairing(
            msg.halfPaired ? "half" : msg.paired === true ? "paired" : msg.paired === false ? "byo" : null,
          );
          break;
        case "estop":
          setStopState(msg.stopped ? "latched" : "clear");
          break;
        case "tool": {
          const run = runFor(msg.runId);
          if (run === undefined) break;
          const key = `${run?.runId ?? "legacy"}:${msg.id}`;
          const call: ToolCall = { id: key, name: msg.name, input: msg.input, at: Date.now() };
          liveCallsRef.current.set(key, { call, run });
          if (onScreen(run)) putToolCallsRef.current([...toolCallsRef.current, call]);
          break;
        }
        case "tool_result": {
          setWorking(null);
          const finished = msg;
          const run = runFor(msg.runId);
          if (run === undefined) break;
          const key = `${run?.runId ?? "legacy"}:${finished.id}`;
          const live = liveCallsRef.current.get(key);
          if (!live) break;
          liveCallsRef.current.delete(key);
          if (onScreen(live.run)) {
            putToolCallsRef.current(
              toolCallsRef.current.map((call) =>
                call.id === key
                  ? { ...call, result: finished.result, ok: finished.ok }
                  : call,
              ),
            );
          }
          // Filed once it has an outcome, so a stored trace is one row per
          // call in its final state — against the run's task, not the
          // selected one. Done HERE rather than inside the updater above:
          // React may invoke an updater more than once, and a write hidden
          // in one is a trap for whoever touches it next.
          void persistTool(finished, live.call, live.run ? live.run.thread : ensureConversation(), live.run?.runId);
          break;
        }
        case "skills": {
          // A name that WAS unproven, still exists, and no longer is: that
          // skill has just run successfully for the first time, which is also
          // the moment it was published. Re-teaching counts — saving drops the
          // proof, and earning it back is a new success worth a new clip.
          const before = unprovenRef.current;
          const now = msg.unproven ?? [];
          const earned = newlyProven(before, msg.skills, now);
          if (earned && platformRef.current) setJustProven({ name: earned, platform: platformRef.current });
          unprovenRef.current = now;
          setSkills(msg.skills);
          setUnproven(now);
          break;
        }
        case "working":
          setWorking(`Checking step ${msg.step}: ${msg.label}`);
          break;
        case "status": {
          if (msg.runId !== undefined && runFor(msg.runId) !== activeRunRef.current) break;
          setActivity(msg.state + (msg.detail ? ` — ${msg.detail}` : ""));
          // A new phase: whatever was being checked a moment ago is over.
          setWorking(null);
          // Anything that moves the arm is worth watching — authoring a skill
          // or replaying a saved one. Only on the transition INTO working, so
          // closing the panel mid-run sticks; and here rather than in the page
          // so it survives the navigation the first message triggers.
          const working = msg.state !== "idle";
          if (working && !workingRef.current) setSimOpen(true);
          workingRef.current = working;
          // Traces accumulate now that they are stored — a second teach in the
          // same task appends to the record rather than erasing the first.
          // Ordering by timestamp keeps each run's workings under the message
          // that prompted them.
          if (!working) void refreshCreditRef.current();
          break;
        }
        case "chat": {
          const run = runFor(msg.runId);
          if (run === undefined) break;
          setLastChat(msg.text);
          appendTo("robot", msg.text, run);
          break;
        }
        case "state":
          jointStateRef.current = msg.arms;
          if (msg.objects) objectsRef.current = msg.objects;
          break;
        case "model":
          if (msg.runId !== undefined && runFor(msg.runId) !== activeRunRef.current) break;
          // Which brain ACTUALLY ran. Both backends go out of their way to
          // echo this because it is what gets billed, and the client dropped
          // it — so an owner who picked one model and was served another had
          // no way to know. Surfaced only when it differs from the pick.
          setRanModel(msg.name);
          break;
        case "sync":
          // A skill saved locally but not copied to the registry is not a
          // failure worth interrupting a teach for — it still runs. It IS
          // worth a visible mark and a retry, which is what this list is.
          setSyncFailures((prev) =>
            msg.ok ? prev.filter((name) => name !== msg.skill)
              : prev.includes(msg.skill) ? prev : [...prev, msg.skill]);
          break;
        case "memory":
          setMemory({ durable: msg.durable, unsaved: msg.unsaved, detail: msg.detail ?? null });
          break;
        case "plan":
        case "step":
          // The blueprint's review-before-run plan view. `step` is already
          // emitted per primitive call; `plan` has no emitter yet. Named here
          // so the exhaustiveness check below stays honest about what is
          // deliberately unrendered rather than accidentally dropped.
          break;
        case "pong":
          break;
        default: {
          // Every RobotMessage must be handled. `model` and `sync` were BOTH
          // being emitted and silently dropped — one of them not even present
          // in the union — and nothing anywhere said so. Adding a protocol
          // event is now a compile error until this switch answers for it.
          const unhandled: never = msg;
          console.warn("[botcortex] unhandled runtime message", unhandled);
        }
      }
  }, [appendTo, ensureConversation, onScreen, persistTool, runFor]);
  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    setTelemetryStale(false);
  }, []);

  const teardown = useCallback(() => {
    connectionEpochRef.current++;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    stopHeartbeat();
    simRef.current?.close();
    simRef.current = null;
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    jointStateRef.current = null;
    objectsRef.current = null;
    fixturesRef.current = null;
    workingRef.current = false;
    liveCallsRef.current.clear();
    runsRef.current.clear();
    activeRunRef.current = null;
    setActiveRun(null);
  }, [stopHeartbeat]);

  useEffect(() => () => teardown(), [teardown]);

  const open = useCallback((endpoint: RobotEndpoint) => {
    intentionalCloseRef.current = false;
    setStatus("connecting");
    setError(null);

    let ws: WebSocket;
    let receivedHello = false;
    const health = new ConnectionHealth();
    try {
      ws = new WebSocket(wsUrl(endpoint));
    } catch {
      setStatus("error");
      setError("Invalid robot address.");
      return;
    }
    wsRef.current = ws;
    endpointRef.current = endpoint;

    // A silent host never fires onerror, so nothing else ends this attempt.
    const deadline = setTimeout(() => {
      if (wsRef.current === ws && !receivedHello) ws.close();
    }, CONNECT_DEADLINE_MS);

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      // A refresh should give a clean scene. Guarded by a ref so it fires once
      // per page load and NOT on the reconnects this socket does after a
      // network blip — those would snap the arm home mid-session. The runtime
      // ignores it while busy, and hardware backends never honour it at all.
      if (!didResetSimRef.current) {
        didResetSimRef.current = true;
        ws.send(JSON.stringify({ type: "reset_sim" } satisfies ClientMessage));
      }
    };

    ws.onmessage = (ev) => {
      if (wsRef.current !== ws || typeof ev.data !== "string") return;
      const msg = parseRobotMessage(ev.data);
      if (!msg || (!receivedHello && msg.type !== "hello")) return;
      health.hear(msg.type);
      setTelemetryStale(health.check().stale);
      if (msg?.type === "hello") {
        receivedHello = true;
        clearTimeout(deadline);
        retriesRef.current = 0;
        setStatus("connected");
        setHost(endpoint.host);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ host: endpoint.host, secure: endpoint.secure, explicitScheme: endpoint.explicitScheme })); } catch { /* optional */ }
        // Liveness from here on: see the constants at the top.
        stopHeartbeat();
        heartbeatRef.current = setInterval(() => {
          if (wsRef.current !== ws || ws.readyState !== WebSocket.OPEN) return;
          const checked = health.check();
          setTelemetryStale(checked.stale);
          if (checked.dead) {
            // Half-open: the browser thinks it is connected, nothing has
            // arrived in a long while. Closing hands over to the retry path,
            // which is the only honest thing to show.
            ws.close();
            return;
          }
          ws.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
        }, PING_INTERVAL_MS);
      }
      handleMessageRef.current(msg);
    };

    ws.onclose = () => {
      clearTimeout(deadline);
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      stopHeartbeat();
      setRobot(null);
      // Whose wallet is unknowable with nothing on the other end. Keeping the
      // last robot's answer would label the NEXT one wrongly on reconnect.
      setPairing(null);
      // A latch confirmed before the socket dropped may since have been
      // cleared by someone at the robot; this tab can no longer say.
      setStopState((current) => (current === "latched" ? "unknown" : current));
      if (intentionalCloseRef.current) {
        setStatus("disconnected");
        return;
      }
      const budget = greetedRef.current ? MAX_RETRIES : MAX_RETRIES_BEFORE_FIRST_HELLO;
      if (retriesRef.current < budget) {
        retriesRef.current += 1;
        setStatus("connecting");
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          if (!intentionalCloseRef.current && !wsRef.current) open(endpoint);
        }, backoffMs(retriesRef.current));
      } else {
        setStatus("error");
        setError("Lost connection to the robot.");
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      // onclose follows; first-attempt failures surface a clearer message.
      if (retriesRef.current === 0 && !receivedHello) {
        setError(endpoint.secure
          ? `Could not reach the robot at ${endpoint.host} over TLS (wss). If the runtime serves plain ws, type ws:// in front of the address.`
          : `Could not reach the robot at ${endpoint.host}.`);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopHeartbeat]);

  const connect = useCallback(
    (rawHost: string) => {
      manualChoiceRef.current = true;
      greetedRef.current = false;
      const parsed = parseRobotEndpoint(rawHost);
      if (!parsed.ok) {
        setStatus("error");
        setError(parsed.error);
        return;
      }
      const endpoint = parsed.endpoint;
      if (mixedContentBlocked(endpoint)) {
        setStatus("error");
        setError(
          endpoint.explicitScheme
            ? "This page is served over https, so the browser blocks a plain ws:// connection to that address. Use wss://, or a robot on localhost."
            : "This page is served over https, so the browser blocks a direct connection to a local robot. Use a tunnel with a certificate (wss://), or use a pairing token once the relay is live.",
        );
        return;
      }
      teardown();
      setRobot(null);
      setSkills(null);
      setHost(null);
      setStopState("clear");
      setActivity("idle");
      setPairing(null);
      setSimBooting(null);
      setMemory(null);
      setSyncFailures([]);
      retriesRef.current = 0;
      open(endpoint);
    },
    [open, teardown],
  );

  const disconnect = useCallback(() => {
    manualChoiceRef.current = true;
    teardown();
    endpointRef.current = null;
    setStatus("disconnected");
    setRobot(null);
    setHost(null);
    setStopState("clear");
    setSimBooting(null);
    setSkills(null);
    setPairing(null);
    setMemory(null);
    setSyncFailures([]);
    setActivity("idle");
    if (platformRef.current !== null) {
      platformRef.current = null;
      void refreshConversationsRef.current();
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* optional */ }
  }, [teardown]);

  /**
   * Become the robot.
   *
   * Downloads ~14 MB the first time (Python, MuJoCo, the runtime wheel), which
   * is why it is never on the path of an owner who has real hardware — it
   * happens only when someone asks for it.
   */
  const connectBrowserSim = useCallback(async (platform?: string) => {
    manualChoiceRef.current = true;
    let chosen: string | null = platform ?? null;
    try {
      if (chosen) localStorage.setItem(SIM_PLATFORM_KEY, chosen);
      else chosen = localStorage.getItem(SIM_PLATFORM_KEY);
    } catch { /* optional */ }
    teardown();
    endpointRef.current = null;
    setError(null);
    setStatus("connecting");
    setHost(null);
    setRobot(null);
    setSkills(null);
    setStopState("clear");
    setPairing(null);
    setMemory(null);
    setSyncFailures([]);
    setActivity("idle");
    const transport = new BrowserSimTransport(
      (msg) => {
        if (simRef.current === transport) handleMessageRef.current(msg);
      },
      {
        accountId,
        platform: chosen,
        onAccountChanged: accountChanged,
        // The worker hung past its deadline or crashed (audit B05). The
        // transport has already closed it; this is the connection dying.
        onDead: (reason) => {
          if (simRef.current !== transport) return;
          simRef.current = null;
          workingRef.current = false;
          setActivity("idle");
          setStatus("error");
          setError(`${reason}.`);
        },
      },
    );
    simRef.current = transport;
    try {
      await transport.open((stage) => {
        if (simRef.current === transport) setSimBooting(stage);
      });
      if (simRef.current !== transport) return;
      setSimBooting(null);
      setStatus("connected");
      setHost("this browser");
      // Remembered, so a reload boots the same body again instead of coming
      // back as "No robot". The runtime is cached by the browser after the
      // first download, and an explicit Disconnect forgets this (Sai's call,
      // Sep 15 2026 — a reload that dropped the robot felt like a bug).
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ sim: true, platform: chosen }));
      } catch { /* optional */ }
    } catch (e) {
      if (simRef.current !== transport) return;
      transport.close();
      console.error("[botcortex] browser sim failed to start", e);
      simRef.current = null;
      setSimBooting(null);
      setStatus("error");
      setError("The in-browser robot could not start. Reload and try again.");
    }
  }, [teardown, accountId, accountChanged]);

  const send = useCallback((msg: ClientMessage): boolean => {
    // The sim answers the identical protocol, so everything above this line —
    // the composer, the skill list, the STOP button — is unaware of which it
    // is talking to.
    const sim = simRef.current;
    if (sim) {
      void sim.send(msg, modelRef.current ?? "");
      return true;
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  sendRef.current = send;

  const sendChat = useCallback(
    (text: string, dryRun: boolean, model?: string | null) => {
      // The transcript rides with the message: each teach is a fresh model
      // conversation, and without it "keep the red block back" arrives
      // meaning nothing — watched live, the agent re-ran the very skill it
      // was being corrected about. Chat text only; the tool traces are the
      // robot's own record and would drown the words.
      const history = messages.slice(-12).map((m) => ({
        role: m.from === "you" ? ("owner" as const) : ("robot" as const),
        text: m.text,
      }));
      // Bound BEFORE sending, so the thread this run files under is the one
      // on screen at the moment of pressing send — whatever gets selected
      // while the robot works.
      const run = startRun();
      // The chosen model rides with the message: the runtime bills whatever it
      // is handed, so the picker has to reach it rather than the robot's
      // startup default.
      const sent = send({ type: "chat", text, dryRun, model: model ?? undefined, history, runId: run.runId });
      if (sent) appendTo("you", text, run);
      else {
        runsRef.current.delete(run.runId);
        if (activeRunRef.current === run) activeRunRef.current = null;
      }
      return sent;
    },
    [send, appendTo, messages, startRun],
  );

  const runSkill = useCallback(
    (name: string, dryRun: boolean) => {
      const run = startRun();
      const sent = send({ type: "run_skill", name, dryRun, runId: run.runId });
      if (sent) appendTo("you", `Run ${name}`, run);
      else {
        runsRef.current.delete(run.runId);
        if (activeRunRef.current === run) activeRunRef.current = null;
      }
      return sent;
    },
    [send, appendTo, startRun],
  );

  /**
   * Stop the agent mid-task. Only the browser sim for now, and deliberately:
   * there the authoring loop runs in this tab, so aborting its signal is the
   * whole of it. A real runtime authors on the robot and `ClientMessage` has
   * no word for "stop authoring" — adding one means a runtime change too, and
   * a button that silently did nothing on hardware would be worse than one
   * that does not appear.
   */
  const interrupt = useCallback(() => {
    const stopped = simRef.current?.interrupt() ?? false;
    if (stopped) {
      workingRef.current = false;
      setActivity("idle");
      liveCallsRef.current.clear();
      activeRunRef.current = null;
    }
    return stopped;
  }, []);
  const interruptible = Boolean(simRef.current) && activity !== "idle";

  const deleteSkill = useCallback((name: string) => send({ type: "delete_skill", name }), [send]);

  /** Ask the browser sim to copy a saved skill to the registry again. */
  const retrySync = useCallback((name: string) => send({ type: "sync_skill", name }), [send]);

  /** STOP goes over plain REST — never queued behind WebSocket traffic. */
  const stop = useCallback(async (): Promise<boolean> => {
    const epoch = connectionEpochRef.current;
    setStopState((current) => (current === "latched" ? current : "pending"));
    const settle = (ok: boolean) => {
      if (connectionEpochRef.current !== epoch) return;
      setStopState((current) => (ok ? "latched" : current === "pending" ? "clear" : current));
    };
    // In-page: playback aborts immediately; confirmation waits for the worker.
    try {
      if (simRef.current) {
        const ok = await simRef.current.stop();
        settle(ok);
        return ok;
      }
      const endpoint = endpointRef.current;
      if (!endpoint) {
        settle(false);
        return false;
      }
      const res = await fetch(`${httpUrl(endpoint)}/stop`, {
        method: "POST", signal: AbortSignal.timeout(4000),
      });
      settle(res.ok);
      return res.ok;
    } catch {
      settle(false);
      return false;
    }
  }, []);

  const resetStop = useCallback(async (): Promise<boolean> => {
    const epoch = connectionEpochRef.current;
    try {
      if (simRef.current) {
        const ok = await simRef.current.resetStop();
        if (ok && connectionEpochRef.current === epoch) setStopState("clear");
        return ok;
      }
      const endpoint = endpointRef.current;
      if (!endpoint) return false;
      const res = await fetch(`${httpUrl(endpoint)}/stop/reset`, {
        method: "POST", signal: AbortSignal.timeout(4000),
      });
      // The runtime also broadcasts an estop event; setting it here means the
      // button responds even if that event is delayed.
      if (res.ok && connectionEpochRef.current === epoch) setStopState("clear");
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  /* Auto-connect: same-origin first (robot-served page), then saved host,
     then the account's paired robots. Every step defers to a choice the
     owner has made by hand in the meantime. */
  useEffect(() => {
    let cancelled = false;
    const tryConnect = (raw: string) => {
      if (cancelled || manualChoiceRef.current) return;
      // Automatic, not manual: leave the flag alone so a later manual choice
      // still wins, but do not let a later automatic one override this.
      const parsed = parseRobotEndpoint(raw);
      if (!parsed.ok) return;
      connectAuto(parsed.endpoint);
    };
    const connectAuto = (endpoint: RobotEndpoint) => {
      if (mixedContentBlocked(endpoint)) return;
      greetedRef.current = false;
      teardown();
      retriesRef.current = 0;
      open(endpoint);
    };
    (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch("/api/status", { signal: ctrl.signal });
        clearTimeout(t);
        if (!cancelled && res.ok) {
          tryConnect(window.location.host);
          return;
        }
      } catch {
        /* not robot-served — fall through */
      }
      if (cancelled) return;
      let saved: string | null = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* optional */ }
      if (saved) {
        try {
          const remembered = JSON.parse(saved) as {
            host?: string; secure?: boolean; explicitScheme?: boolean; sim?: boolean; platform?: string | null;
          };
          if (remembered.sim) {
            // The in-tab robot was what this browser last used: boot it on the
            // same body. connectBrowserSim marks the choice manual, exactly as
            // clicking the card did.
            if (!manualChoiceRef.current) void connectBrowserSim(remembered.platform ?? undefined);
            return;
          }
          if (remembered.host) {
            // Re-dial exactly what worked, scheme included.
            const scheme = remembered.explicitScheme ? (remembered.secure ? "wss://" : "ws://") : "";
            tryConnect(`${scheme}${remembered.host}`);
            return;
          }
        } catch {
          /* ignore corrupt entry */
        }
      }

      // Nothing remembered on this browser — ask the account which robots it
      // has paired. This is what `botcortex login` buys: a fresh browser
      // connects to your robot without you knowing its address.
      try {
        const res = await fetch("/api/robots");
        if (cancelled || !res.ok) return;
        const { robots } = (await res.json()) as {
          robots: { address: string | null; lastSeenAt: string | null }[];
        };
        // Only a robot that announced itself recently is worth dialling
        // unasked. A laptop that served the runtime once, weeks ago, sat at
        // the top of this list and put the app into "connecting…" against
        // a dead address on every load.
        const reachable = robots.find(
          (r) => r.address && (ageMs(r.lastSeenAt) ?? Infinity) <= AUTO_CONNECT_WITHIN_MS,
        );
        if (reachable?.address) tryConnect(reachable.address);
      } catch {
        /* not signed in, or the api is unreachable — the Connect dialog remains */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RobotContext.Provider
      value={{
        status,
        robot,
        skills,
        unproven,
        host,
        error,
        activity,
        working,
        interrupt,
        interruptible,
        justProven,
        dismissProven: () => setJustProven(null),
        lastChat,
        messages,
        jointStateRef,
        objectsRef,
        fixturesRef,
        connect,
        disconnect,
        sendChat,
        runSkill,
        deleteSkill,
        stop,
        stopped: stopState === "latched" || stopState === "unknown",
        stopState,
        resetStop,
        conversations,
        conversationId,
        newConversation,
        openConversation,
        deleteConversation,
        connectBrowserSim,
        simBooting,
        ranModel,
        credit,
        acknowledgeWelcome,
        pairing,
        toolCalls,
        activeRun,
        persistence,
        retryPersistence,
        historyTruncated,
        memory,
        syncFailures,
        retrySync,
        telemetryStale,
        simOpen,
        setSimOpen,
        dryRun,
        setDryRun,
        model,
        setModel,
      }}
    >
      {children}
    </RobotContext.Provider>
  );
}
