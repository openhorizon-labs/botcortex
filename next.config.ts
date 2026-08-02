import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Normal Vercel deployment (static export dropped Aug 2, Sai's call) —
  // the hosted app is the front door; robots and botcortex-api sit behind it.
  // Auth is proxied same-origin so session cookies stay first-party
  // (Safari blocks cross-site cookies) and middleware can gate /app.
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:8787";
    return [
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
      { source: "/api/me", destination: `${api}/api/me` },
    ];
  },
};

export default nextConfig;
