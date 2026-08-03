import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      { source: "/api/robots", destination: `${api}/api/robots` },
      { source: "/api/messages", destination: `${api}/api/messages` },
      { source: "/api/conversations", destination: `${api}/api/conversations` },
      { source: "/api/conversations/:id", destination: `${api}/api/conversations/:id` },
      { source: "/api/device/pending", destination: `${api}/api/device/pending` },
    ];
  },
};

export default nextConfig;
