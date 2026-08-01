# BotCortex — session bootstrap

- **Load the `runtime-architecture` skill before writing product code** — it is the
  blueprint and holds every locked decision. Company skills live in
  github.com/openhorizon-labs/skills, symlinked into `~/.claude/skills/`.
- **Safety is non-negotiable:** dry-run is the default; never cause real motion without
  an operator present, an explicit `--execute`, and the user's go-ahead in the current
  session. Load the `thor-openarm` skill before touching hardware.
- Before every commit: `make test`, then the mock smoke test
  `uv run botcortex --mock "wave right arm"`.
- `ui/` is Next.js + Bun with `output: "export"` — `bun run build` → `ui/out/`, served
  by the robot's FastAPI server locally. **Sai deploys to Vercel himself from GitHub
  (Root Directory = `ui/`); sessions push commits, never deploy.**
- Never leave this repo dirty at session end; commit conventions follow the
  `sync-company-skills` skill.
