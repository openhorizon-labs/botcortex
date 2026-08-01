# BotCortex Web — session bootstrap

- This repo is **web only**: `app/` = chat web app (Next.js + Bun, `output: "export"`),
  `site/` = marketing site (later). The Python runtime lives in the separate
  `botcortex-runtime` repo; cloud services in `botcortex-api` (later).
- **Load the `runtime-architecture` skill** before product work — it holds the UI
  decisions (chat authors, ReactFlow plan-view only, WebSocket transport, STOP as its
  own REST endpoint) and the whole blueprint.
- Next.js here is v16+ — conventions may differ from training data; check
  `app/node_modules/next/dist/docs/` before non-trivial Next work.
- Build check before committing: `cd app && bun run build`.
- **Sai deploys via Vercel himself (Root Directory = `app/`); sessions push to GitHub,
  never deploy.**
- Never leave this repo dirty at session end; commit conventions follow the
  `sync-company-skills` skill.
