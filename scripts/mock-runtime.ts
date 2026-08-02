/**
 * Mock BotCortex runtime for frontend development.
 * Speaks the protocol in lib/robot/protocol.ts: /ws WebSocket, POST /stop,
 * GET /api/status. Run with:  bun scripts/mock-runtime.ts  (port 9090)
 */

const PORT = Number(process.env.PORT ?? 9090);

const SKILLS = ["wave_right_arm", "pick_and_place", "fold_towel", "stack_cups"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws" && server.upgrade(req)) return;
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/api/status") {
      return Response.json(
        { ok: true, name: "OpenArm v1 (mock)" },
        { headers: CORS },
      );
    }
    if (url.pathname === "/stop" && req.method === "POST") {
      console.log("⛔ STOP received — would touch ~/openarm_agent_STOP");
      return Response.json({ stopped: true }, { headers: CORS });
    }
    return new Response("botcortex mock runtime", { headers: CORS });
  },
  websocket: {
    open(ws) {
      console.log("client connected");
      ws.send(
        JSON.stringify({
          type: "hello",
          robot: { name: "OpenArm v1 (mock)", platform: "Jetson AGX Thor" },
          skills: SKILLS,
        }),
      );
      ws.send(JSON.stringify({ type: "status", state: "idle" }));
    },
    message(ws, raw) {
      let msg: { type?: string; text?: string; name?: string; dryRun?: boolean };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      console.log("←", msg);
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else if (msg.type === "chat") {
        ws.send(JSON.stringify({ type: "status", state: "teaching" }));
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              type: "chat",
              text: `Mock runtime heard: "${msg.text}" (dryRun=${msg.dryRun}). A real runtime would author a skill now.`,
            }),
          );
          ws.send(JSON.stringify({ type: "status", state: "idle" }));
        }, 800);
      } else if (msg.type === "run_skill") {
        ws.send(
          JSON.stringify({
            type: "status",
            state: "running",
            detail: msg.name,
          }),
        );
        setTimeout(() => {
          ws.send(JSON.stringify({ type: "status", state: "idle" }));
          ws.send(
            JSON.stringify({
              type: "chat",
              text: `Skill ${msg.name} finished (mock, dryRun=${msg.dryRun}).`,
            }),
          );
        }, 1500);
      }
    },
    close() {
      console.log("client disconnected");
    },
  },
});

console.log(`mock runtime listening on http://localhost:${PORT} (ws at /ws)`);
