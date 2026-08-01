# BotCortex

Teach your robot new tasks by typing. An AI agent authors each skill **once**; the
runtime on the robot executes it deterministically at control rate, forever.
**The LLM is never in the real-time control loop.**

Built by [OpenHorizon Labs](https://openhorizon.so).
*Local execution, cloud intelligence — taught skills keep running with zero internet;
learning new ones uses the best available model with your own API key.*

## What this repo contains (one repo, whole product)

| Path | What it is |
|---|---|
| `botcortex/` | The runtime: motion primitives, skill store, episodic memory, authoring agent, CLI, FastAPI server |
| `ui/` | The chat web app (Next.js + Bun + Tailwind, static export). Served by the robot on the local network, and deployed to Vercel for hosted access |
| `tests/` | pytest suite — mock-mode only, no hardware required |

## Why memory is the core

Feeding failure diagnostics back to the authoring agent improves manipulation success
by up to **+35%**, validated on a real 6-DoF arm (RoboInspector, ACM TIST 2026,
[arXiv:2508.21378](https://arxiv.org/abs/2508.21378)). BotCortex records every task
attempt as an episode on the robot and recalls those lessons the next time it learns —
your robot gets better at *your* tasks, and the traces stay on your hardware.

## Development

```bash
uv sync                              # Python environment
make test                            # run the suite
uv run botcortex --mock "wave right arm"   # mock-mode smoke test

cd ui && bun install && bun run dev  # web app, hot reload
```

## Deployment

- **Web app → Vercel**, from this single repo: import the GitHub repo in Vercel and
  set **Root Directory to `ui/`** — Next.js is auto-detected, and every push to main
  deploys. The build is a static export (`output: "export"` → `ui/out/`), so the
  identical artifact is served by the robot locally and by Vercel in the cloud.
- **Runtime → the robot**: `make deploy` (rsync to the robot, runs under systemd).

## Safety

Dry-run is the default everywhere. Real motion requires an explicit `--execute` flag
**and** an operator present. An e-stop file check runs between every interpolation
step, and joint targets are clamped inside vendor limits with a safety margin.

## License

Apache-2.0
