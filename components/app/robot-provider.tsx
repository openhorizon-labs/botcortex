"use client";

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
  type ClientMessage,
  httpUrl,
  mixedContentBlocked,
  normalizeHost,
  wsUrl,
} from "@/lib/robot/protocol";

const STORAGE_KEY = "botcortex.robot";
const RETRY_DELAY_MS = 3000;
const MAX_RETRIES = 5;

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
  connect: (rawHost: string) => void;
  disconnect: () => void;
  sendChat: (text: string, dryRun: boolean) => boolean;
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
  /** Remaining BotCortex credit, or null when signed out / unreachable. */
  credit: Credit | null;
};

export type Credit = {
  balanceMicros: number;
  spentMicros: number;
  display: string;
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
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [robot, setRobot] = useState<RobotInfo | null>(null);
  const [skills, setSkills] = useState<string[] | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState("idle");
  const [lastChat, setLastChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stopped, setStopped] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  /** Read by persist(), which is built once and would otherwise capture the
   *  first render's (null) thread id forever. */
  const conversationIdRef = useRef<string | null>(null);

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

  const append = useCallback(
    (from: ChatMessage["from"], text: string) => {
      // crypto.randomUUID, not a timestamp+index: the id is the dedup key on
      // the server, so it has to survive a reload and a retried POST.
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
        return id;
      })();
      creatingRef.current.finally(() => {
        creatingRef.current = null;
      });
    }
    return creatingRef.current;
  }, []);

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
        messages: { id: string; author: ChatMessage["from"]; text: string; createdAt: string }[];
      };
      setMessages(
        history.map((m) => ({
          id: m.id,
          from: m.author,
          text: m.text,
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
        if (rows[0]) await openConversation(rows[0].id);
        else await newConversation();
      }
    },
    [refreshConversations, openConversation, newConversation],
  );

  // Rehydrate on load: reopen the most recent thread. With none, stay on a
  // blank one — the first message will create it.
  useEffect(() => {
    if (didLoadHistoryRef.current) return;
    didLoadHistoryRef.current = true;
    void (async () => {
      const rows = await refreshConversations();
      if (rows[0]) await openConversation(rows[0].id);
    })();
  }, [refreshConversations, openConversation]);

  const teardown = useCallback(() => {
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

    ws.onopen = () => {
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
      switch (msg.type) {
        case "hello":
          setRobot(msg.robot);
          setSkills(msg.skills);
          // A page loaded while the robot is already stopped must say so.
          setStopped(Boolean(msg.stopped));
          break;
        case "estop":
          setStopped(msg.stopped);
          break;
        case "skills":
          setSkills(msg.skills);
          break;
        case "status":
          setActivity(msg.state + (msg.detail ? ` — ${msg.detail}` : ""));
          // Back to idle means a teach just finished spending.
          if (msg.state === "idle") void refreshCreditRef.current();
          break;
        case "chat":
          setLastChat(msg.text);
          appendRef.current("robot", msg.text);
          break;
        case "state":
          jointStateRef.current = msg.arms;
          break;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setRobot(null);
      if (intentionalCloseRef.current) {
        setStatus("disconnected");
        return;
      }
      if (retriesRef.current < MAX_RETRIES) {
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
    setActivity("idle");
    localStorage.removeItem(STORAGE_KEY);
  }, [teardown]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const sendChat = useCallback(
    (text: string, dryRun: boolean) => {
      const sent = send({ type: "chat", text, dryRun });
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
    if (!host) return false;
    try {
      const res = await fetch(`${httpUrl(host)}/stop`, { method: "POST" });
      return res.ok;
    } catch {
      return false;
    }
  }, [host]);

  const resetStop = useCallback(async (): Promise<boolean> => {
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
        host,
        error,
        activity,
        lastChat,
        messages,
        jointStateRef,
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
        credit,
      }}
    >
      {children}
    </RobotContext.Provider>
  );
}
