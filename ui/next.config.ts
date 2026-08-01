import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the robot's FastAPI server serves `out/` on the LAN;
  // Vercel hosts the same build. No server runtime required anywhere.
  output: "export",
};

export default nextConfig;
