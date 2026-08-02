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

type RobotContextValue = {
  status: ConnectionStatus;
  robot: RobotInfo | null;
  skills: string[] | null;
  host: string | null;
  error: string | null;
  /** Robot-side activity: idle / teaching / running. */
  activity: string;
  lastChat: string | null;
  /** Latest joint state, written at ~15 Hz. A ref on purpose: the 3D scene
   *  reads it per-frame; routing it through React state would re-render the
   *  whole app at stream rate. */
  jointStateRef: React.RefObject<JointState | null>;
  connect: (rawHost: string) => void;
  disconnect: () => void;
  sendChat: (text: string, dryRun: boolean) => boolean;
  runSkill: (name: string, dryRun: boolean) => boolean;
  stop: () => Promise<boolean>;
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

  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const jointStateRef = useRef<JointState | null>(null);

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
          break;
        case "skills":
          setSkills(msg.skills);
          break;
        case "status":
          setActivity(msg.state + (msg.detail ? ` — ${msg.detail}` : ""));
          break;
        case "chat":
          setLastChat(msg.text);
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
    (text: string, dryRun: boolean) => send({ type: "chat", text, dryRun }),
    [send],
  );

  const runSkill = useCallback(
    (name: string, dryRun: boolean) =>
      send({ type: "run_skill", name, dryRun }),
    [send],
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
          if (savedHost) connect(savedHost);
        } catch {
          /* ignore corrupt entry */
        }
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
        jointStateRef,
        connect,
        disconnect,
        sendChat,
        runSkill,
        stop,
      }}
    >
      {children}
    </RobotContext.Provider>
  );
}
