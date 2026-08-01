# BotCortex Web — session bootstrap

@AGENTS.md

- This repo is **web only**, Next.js at the root: `app/` holds the routes (`/` =
  marketing landing, `/app` = the chat app the robot serves). The Python runtime lives
  in the separate `botcortex-runtime` repo; cloud services in `botcortex-api` (later).
- **Load the `runtime-architecture` skill** before product work — it holds the UI
  decisions (chat authors, ReactFlow plan-view only, WebSocket transport, STOP as its
  own REST endpoint) and the design system.
- Reuse `components/kit/` (RunnerBadge, LiveDot, CopyCommand, Reveal, CountUp) instead
  of re-rolling animations; colors come from tokens in `app/globals.css`, never raw
  Tailwind palette values. Red is reserved for STOP.
- Build check before committing: `bun run build`.
- **Sai deploys via Vercel himself (default root directory); sessions push to GitHub,
  never deploy.**
- Never leave this repo dirty at session end; commit conventions follow the
  `sync-company-skills` skill.
