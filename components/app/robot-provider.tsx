"use client";

import { useRouter } from "next/navigation";

import { BrowserSimTransport } from "@/lib/robot/browser-sim/transport";
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
  type RobotInfo,
  type RobotMessage,
  type SceneBodies,
  type ClientMessage,
  httpUrl,
  mixedContentBlocked,
  normalizeHost,
  wsUrl,
} from "@/lib/robot/protocol";

const STORAGE_KEY = "botcortex.robot";
const RETRY_DELAY_MS = 3000;
/** Retries for a robot that has ALREADY answered once — a Wi-Fi blip, a
 *  runtime restart. Patience is right there: the robot is real and coming back. */
const MAX_RETRIES = 5;
/** Retries before the FIRST hello: none. Nothing has proved the address is
 *  there, a robot that IS there answers at once, and five attempts at three
 *  seconds left a new account watching "connecting…" for nineteen seconds with
 *  no idea whether the product was working. Failing fast is what surfaces the
 *  in-browser robot, which is the answer for anyone without hardware. */
const MAX_RETRIES_BEFORE_FIRST_HELLO = 0;
/** How long one attempt may sit in TCP connect before we call it dead.
 *
 *  Cutting the retry COUNT was not enough, and it is worth recording why: an
 *  address that is switched off drops packets rather than refusing them, so
 *  the socket does not error — it hangs until the browser's own connect
 *  timeout, tens of seconds later. The count never dominated; this does. */
const CONNECT_DEADLINE_MS = 4000;

export type ChatMessage = {
  id: string;
  from: "you" | "robot";
  text: string;
  at: number;
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
  stop: () => Promise<boolean>;
  /** True while the e-stop is latched — motion stays blocked until cleared. */
  stopped: boolean;
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
  /** Boot the robot INSIDE this tab — no runtime, no hardware. */
  connectBrowserSim: () => Promise<void>;
  /** Which stage the in-page robot is at while it loads, or null. */
  simBooting: string | null;
  /** Which model the last teach REALLY ran on — echoed by the robot, never
   *  assumed, because it is what the account was billed for. */
  ranModel: string | null;
  /** Remaining BotCortex credit, or null when signed out / unreachable. */
  credit: Credit | null;
  /** Which wallet the connected robot teaches from — null until it says.
   *  "half" is a broken setup (pointed at BotCortex, no key): the runtime
   *  refuses to teach, so showing a balance would be a lie. */
  pairing: "paired" | "byo" | "half" | null;
  /** What the agent is doing right now, oldest first. */
  toolCalls: ToolCall[];

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
};

/** One reach into the runtime, from call to result. Live-only: traces are not
 *  persisted, so reopening an old thread shows its words but not its workings. */
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
  updatedAt: string;
  messages: number;
};

const RobotContext = createContext<RobotContextValue | null>(null);

export function useRobot() {
  const ctx = useContext(RobotContext);
  if (!ctx) throw new Error("useRobot must be used inside RobotProvider");
  return ctx;
}

export function RobotProvider({ children }: { children: React.ReactNode }) {
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
  const [host, setHost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState("idle");
  const [lastChat, setLastChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stopped, setStopped] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [pairing, setPairing] = useState<RobotContextValue["pairing"]>(null);
  /** The model the last teach actually ran on, as the robot reported it. */
  const [ranModel, setRanModel] = useState<string | null>(null);
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
   * The authoritative list, written synchronously.
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
  const [simOpen, setSimOpen] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [model, setModel] = useState<string | null>(null);
  // Read inside send(), which is memoised with no deps — a stale closure would
  // bill whatever model was picked when the provider first mounted.
  const modelRef = useRef<string | null>(null);
  modelRef.current = model;
  const [conversationId, setConversationId] = useState<string | null>(null);
  /** Read by persist(), which is built once and would otherwise capture the
   *  first render's (null) thread id forever. */
  const conversationIdRef = useRef<string | null>(null);

  /** Set the instant anything is said, synchronously, so the rehydrate below
   *  can tell whether it would be trampling a live conversation. */
  const spokeRef = useRef(false);

  /** Persist one message. Fire-and-forget: the transcript is a record, and
   *  losing a line of it must never interrupt teaching a robot. */
  const persist = useCallback(async (msg: ChatMessage) => {
    try {
      // Creates the thread if this is the first thing said in it. Dropping the
      // message when no thread existed yet is how the opening line of a
      // conversation went missing.
      const thread = await ensureConversationRef.current();
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: msg.id,
          conversationId: thread,
          author: msg.from,
          text: msg.text,
        }),
      });
      await refreshConversationsRef.current();
    } catch {
      /* offline: the message is already on screen, just not filed */
    }
  }, []);

  /** Store a finished tool call alongside the conversation, so reopening a
   *  task shows HOW a skill was authored and not merely that it was. */
  const persistTool = useCallback(
    async (call: { id: string; result?: string; ok?: boolean }) => {
    try {
      const live = toolCallsRef.current.find((c) => c.id === call.id);
      if (!live) return;
      // Await the task rather than bailing when it does not exist yet. The
      // agent starts calling tools within a second of the message being sent,
      // which is faster than the round-trip that creates the task — so a
      // "skip if missing" check silently dropped the OPENING calls of every
      // teach, which are the ones that show what it looked at first.
      const thread = await ensureConversationRef.current();
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Namespaced by task. The runtime's call id is 8 hex characters —
          // a correlation handle for one teach, never meant to be a key
          // across every conversation in the database. Used raw, repeats
          // landed on rows belonging to other tasks, where onConflictDoNothing
          // silently discarded them: the trace looked saved and was not.
          // Still deterministic, so a retry updates rather than duplicates.
          id: `${thread}:${call.id}`,
          conversationId: thread,
          author: "robot",
          kind: "tool",
          text: live.name,
          payload: {
            name: live.name,
            input: live.input,
            result: call.result,
            ok: call.ok,
          },
        }),
      });
    } catch {
      /* the trace is a record; losing one must not disturb teaching */
    }
    },
    [],
  );


  const persistToolRef = useRef(persistTool);
  useEffect(() => {
    persistToolRef.current = persistTool;
  }, [persistTool]);

  /** open() is built once, so it reaches these through refs. */
  const putToolCallsRef = useRef(putToolCalls);
  useEffect(() => {
    putToolCallsRef.current = putToolCalls;
  }, [putToolCalls]);

  const append = useCallback(
    (from: ChatMessage["from"], text: string) => {
      // crypto.randomUUID, not a timestamp+index: the id is the dedup key on
      // the server, so it has to survive a reload and a retried POST.
      spokeRef.current = true;
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        from,
        text,
        at: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      void persist(msg);
    },
    [persist],
  );

  const wsRef = useRef<WebSocket | null>(null);
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

  /** open() is built once with empty deps, so reaching append directly would
   *  capture the first render's copy forever. */
  const appendRef = useRef(append);
  useEffect(() => {
    appendRef.current = append;
  }, [append]);

  const selectThread = useCallback((id: string | null) => {
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
  const creatingRef = useRef<Promise<string> | null>(null);
  const ensureConversation = useCallback(async (): Promise<string> => {
    const existing = conversationIdRef.current;
    if (existing) return existing;
    // One in-flight create at a time: two messages sent together must land in
    // the same thread, not race into two.
    if (!creatingRef.current) {
      creatingRef.current = (async () => {
        const res = await fetch("/api/conversations", { method: "POST" });
        if (!res.ok) throw new Error("could not start a conversation");
        const { id } = (await res.json()) as { id: string };
        conversationIdRef.current = id;
        setConversationId(id);
        // replace, not push — an empty /app is not somewhere to go Back to.
        router.replace(`/app/tasks/${id}`);
        return id;
      })();
      creatingRef.current.finally(() => {
        creatingRef.current = null;
      });
    }
    return creatingRef.current;
  }, [router]);

  const ensureConversationRef = useRef(ensureConversation);
  useEffect(() => {
    ensureConversationRef.current = ensureConversation;
  }, [ensureConversation]);

  const refreshCredit = useCallback(async () => {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) setCredit((await res.json()) as Credit);
    } catch {
      /* signed out or offline — the sidebar just omits the figure */
    }
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

  const refreshConversations = useCallback(async (): Promise<Conversation[]> => {
    try {
      const res = await fetch("/api/conversations");
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
    try {
      const res = await fetch(`/api/messages?conversation=${encodeURIComponent(id)}&limit=200`);
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
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      selectThread(id);
      setMessages([]);
      // Cleared so the previous task's workings never bleed through; the
      // load below refills them from what was stored.
      putToolCalls([]);
      await loadMessages(id);
    },
    [loadMessages, selectThread],
  );

  /**
   * Starts a fresh thread. ADDITIVE — this used to delete the transcript
   * outright, so clicking "New task" cost you every previous conversation.
   */
  const newConversation = useCallback(async () => {
    setMessages([]);
    putToolCalls([]);
    // Nothing is created until something is said — so clicking "New task"
    // twice cannot leave two empty threads behind.
    selectThread(null);
    await refreshConversations();
  }, [refreshConversations, selectThread]);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      } catch {
        /* ignore */
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
        if (next) await openConversation(next.id);
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
          setRobot(msg.robot);
          setSkills(msg.skills);
          setUnproven(msg.unproven ?? []);
          // A page loaded while the robot is already stopped must say so.
          setStopped(Boolean(msg.stopped));
          // Older runtimes send neither field. Treating that as "paired"
          // would reinstate exactly the silent lie this exists to end, so
          // absent means unknown and the credit row stays quiet.
          setPairing(
            msg.halfPaired ? "half" : msg.paired === true ? "paired" : msg.paired === false ? "byo" : null,
          );
          // Furniture arrives once and never changes; a robot with no workcell
          // sends none, and the viewer draws just the arm as before.
          fixturesRef.current = msg.fixtures ?? null;
          break;
        case "estop":
          setStopped(msg.stopped);
          break;
        case "tool":
          putToolCallsRef.current([
            ...toolCallsRef.current,
            { id: msg.id, name: msg.name, input: msg.input, at: Date.now() },
          ]);
          break;
        case "tool_result": {
          const finished = msg;
          putToolCallsRef.current(
            toolCallsRef.current.map((call) =>
              call.id === finished.id
                ? { ...call, result: finished.result, ok: finished.ok }
                : call,
            ),
          );
          // Filed once it has an outcome, so a stored trace is one row per
          // call in its final state. Done HERE rather than inside the updater
          // above — React may invoke an updater more than once, and a write
          // hidden in one is a trap for whoever touches it next.
          void persistToolRef.current(finished);
          break;
        }
        case "skills":
          setSkills(msg.skills);
          setUnproven(msg.unproven ?? []);
          break;
        case "status": {
          setActivity(msg.state + (msg.detail ? ` — ${msg.detail}` : ""));
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
        case "chat":
          setLastChat(msg.text);
          appendRef.current("robot", msg.text);
          break;
        case "state":
          jointStateRef.current = msg.arms;
          if (msg.objects) objectsRef.current = msg.objects;
          break;
        case "model":
          // Which brain ACTUALLY ran. Both backends go out of their way to
          // echo this because it is what gets billed, and the client dropped
          // it — so an owner who picked one model and was served another had
          // no way to know. Surfaced only when it differs from the pick.
          setRanModel(msg.name);
          break;
        case "sync":
          // A skill saved locally but not copied to the registry is not a
          // failure worth interrupting a teach for — it still runs. Worth
          // knowing about, so it goes to the console rather than nowhere.
          if (!msg.ok) {
            console.warn(`[botcortex] skill ${msg.skill} did not reach the registry`);
          }
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
  }, []);
  const handleMessageRef = useRef(handleMessage);
  handleMessageRef.current = handleMessage;

  const teardown = useCallback(() => {
    simRef.current?.close();
    simRef.current = null;
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const open = useCallback((cleanHost: string) => {
    intentionalCloseRef.current = false;
    setStatus("connecting");
    setError(null);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(cleanHost));
    } catch {
      setStatus("error");
      setError("Invalid robot address.");
      return;
    }
    wsRef.current = ws;

    // A silent host never fires onerror, so nothing else ends this attempt.
    const deadline = setTimeout(() => {
      if (wsRef.current === ws && ws.readyState === WebSocket.CONNECTING) ws.close();
    }, CONNECT_DEADLINE_MS);

    ws.onopen = () => {
      clearTimeout(deadline);
      retriesRef.current = 0;
      setStatus("connected");
      setHost(cleanHost);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ host: cleanHost }));

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
      let msg: RobotMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      handleMessageRef.current(msg);
    };

    ws.onclose = () => {
      clearTimeout(deadline);
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setRobot(null);
      // Whose wallet is unknowable with nothing on the other end. Keeping the
      // last robot's answer would label the NEXT one wrongly on reconnect.
      setPairing(null);
      if (intentionalCloseRef.current) {
        setStatus("disconnected");
        return;
      }
      const budget = greetedRef.current ? MAX_RETRIES : MAX_RETRIES_BEFORE_FIRST_HELLO;
      if (retriesRef.current < budget) {
        retriesRef.current += 1;
        setStatus("connecting");
        setTimeout(() => {
          if (!intentionalCloseRef.current && !wsRef.current) open(cleanHost);
        }, RETRY_DELAY_MS);
      } else {
        setStatus("error");
        setError("Lost connection to the robot.");
      }
    };

    ws.onerror = () => {
      // onclose follows; first-attempt failures surface a clearer message.
      if (retriesRef.current === 0 && status !== "connected") {
        setError("Could not reach the robot at that address.");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(
    (rawHost: string) => {
      greetedRef.current = false;
      const cleanHost = normalizeHost(rawHost);
      if (!cleanHost) return;
      if (mixedContentBlocked(cleanHost)) {
        setStatus("error");
        setError(
          "This page is served over https, so the browser blocks a direct connection to a local robot. Open the app from the robot itself, or use a pairing token once the relay is live.",
        );
        return;
      }
      teardown();
      retriesRef.current = 0;
      open(cleanHost);
    },
    [open, teardown],
  );

  const disconnect = useCallback(() => {
    teardown();
    setStatus("disconnected");
    setRobot(null);
    setSkills(null);
    setPairing(null);
    setActivity("idle");
    localStorage.removeItem(STORAGE_KEY);
  }, [teardown]);

  /**
   * Become the robot.
   *
   * Downloads ~14 MB the first time (Python, MuJoCo, the runtime wheel), which
   * is why it is never on the path of an owner who has real hardware — it
   * happens only when someone asks for it.
   */
  const connectBrowserSim = useCallback(async () => {
    teardown();
    setError(null);
    setStatus("connecting");
    const transport = new BrowserSimTransport((msg) => handleMessageRef.current(msg));
    simRef.current = transport;
    try {
      await transport.open((stage) => setSimBooting(stage));
      setSimBooting(null);
      setStatus("connected");
      setHost("this browser");
      // Not remembered in localStorage: nothing was paired, and silently
      // booting 14 MB of WASM on the next visit is not a decision to make on
      // someone's behalf.
    } catch (e) {
      console.error("[botcortex] browser sim failed to start", e);
      simRef.current = null;
      setSimBooting(null);
      setStatus("error");
      setError("The in-browser robot could not start. Reload and try again.");
    }
  }, [teardown]);

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

  const sendChat = useCallback(
    (text: string, dryRun: boolean, model?: string | null) => {
      // The chosen model rides with the message: the runtime bills whatever it
      // is handed, so the picker has to reach it rather than the robot's
      // startup default.
      const sent = send({ type: "chat", text, dryRun, model: model ?? undefined });
      if (sent) append("you", text);
      return sent;
    },
    [send, append],
  );

  const runSkill = useCallback(
    (name: string, dryRun: boolean) => {
      const sent = send({ type: "run_skill", name, dryRun });
      if (sent) append("you", `Run ${name}`);
      return sent;
    },
    [send, append],
  );

  /** STOP goes over plain REST — never queued behind WebSocket traffic. */
  const stop = useCallback(async (): Promise<boolean> => {
    // In-page: no host to POST to, and the same latch either way — a file the
    // primitives check before every frame.
    if (simRef.current) {
      simRef.current.stop();
      setStopped(true);
      return true;
    }
    if (!host) return false;
    try {
      const res = await fetch(`${httpUrl(host)}/stop`, { method: "POST" });
      return res.ok;
    } catch {
      return false;
    }
  }, [host]);

  const resetStop = useCallback(async (): Promise<boolean> => {
    if (simRef.current) {
      simRef.current.resetStop();
      setStopped(false);
      return true;
    }
    if (!host) return false;
    try {
      const res = await fetch(`${httpUrl(host)}/stop/reset`, { method: "POST" });
      // The runtime also broadcasts an estop event; setting it here means the
      // button responds even if that event is delayed.
      if (res.ok) setStopped(false);
      return res.ok;
    } catch {
      return false;
    }
  }, [host]);

  /* Auto-connect: same-origin first (robot-served page), then saved host. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch("/api/status", { signal: ctrl.signal });
        clearTimeout(t);
        if (!cancelled && res.ok) {
          connect(window.location.host);
          return;
        }
      } catch {
        /* not robot-served — fall through */
      }
      if (cancelled) return;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const { host: savedHost } = JSON.parse(saved);
          if (savedHost) {
            connect(savedHost);
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
          robots: { address: string | null }[];
        };
        const reachable = robots.find((r) => r.address);
        if (reachable?.address) connect(reachable.address);
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
        lastChat,
        messages,
        jointStateRef,
        objectsRef,
        fixturesRef,
        connect,
        disconnect,
        sendChat,
        runSkill,
        stop,
        stopped,
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
        pairing,
        toolCalls,
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
