import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Normal Vercel deployment (static export dropped Aug 2, Sai's call) —
  // the hosted app is the front door; robots and botcortex-api sit behind it.
  // Auth is proxied same-origin so session cookies stay first-party
  // (Safari blocks cross-site cookies) and middleware can gate /app.
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:8787";
    // Every account route goes through here for the same reason: the session
    // cookie is first-party to THIS origin, so a browser fetch straight to
    // botcortex-api carries no credentials and lands on a 401.
    return [
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
      { source: "/api/me", destination: `${api}/api/me` },
      { source: "/api/keys", destination: `${api}/api/keys` },
      { source: "/api/keys/:id", destination: `${api}/api/keys/:id` },
      { source: "/api/credits", destination: `${api}/api/credits` },
      // POST /api/credits/welcome/seen. Without this the welcome dialog's
      // acknowledgement 404'd here and the dialog came back on every login.
      { source: "/api/credits/:path*", destination: `${api}/api/credits/:path*` },
      { source: "/api/models", destination: `${api}/api/models` },
      { source: "/api/robots", destination: `${api}/api/robots` },
      { source: "/api/robots/:id", destination: `${api}/api/robots/:id` },
      { source: "/api/messages", destination: `${api}/api/messages` },
      { source: "/api/conversations", destination: `${api}/api/conversations` },
      { source: "/api/conversations/:id", destination: `${api}/api/conversations/:id` },
      { source: "/api/device/pending", destination: `${api}/api/device/pending` },
      // The browser sim's agent loop runs in the page, so its inference goes
      // through here too — same meter, same balance gate, and the browser
      // never holds a robot key.
      { source: "/api/inference/:path*", destination: `${api}/api/inference/:path*` },
      // And its skill sync: a skill taught in the browser lands in the same
      // account registry a robot's would.
      { source: "/api/skills", destination: `${api}/api/skills` },
      // And the way back: the sim reads the account's skills at boot and
      // marks the registry copy proven when it sees one run.
      { source: "/api/skills/:path*", destination: `${api}/api/skills/:path*` },
      // The public registry, for the app's publish menu to read back.
      { source: "/api/registry", destination: `${api}/api/registry` },
      // One skill, an author's page, and "someone ran this" from the public
      // player — same-origin, so a signed-in author's own runs are recognised
      // by their cookie and not counted as votes.
      { source: "/api/registry/:path*", destination: `${api}/api/registry/:path*` },
      // The handle skills are published under (Settings -> Account).
      { source: "/api/profile", destination: `${api}/api/profile` },
      // "Is this username free?", asked while it is typed.
      { source: "/api/profile/:path*", destination: `${api}/api/profile/:path*` },
    ];
  },
};

export default nextConfig;
