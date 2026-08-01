# BotCortex

**The robot's motor cortex.** Teach your robot new tasks by typing — an AI agent
authors the skill once; the runtime executes it locally at control rate, forever.
No engineers, no cloud in the control loop.

By [OpenHorizon Labs](https://openhorizon.so). *Local execution, cloud intelligence —
works without internet, learns best with it.*

## Why memory is the core

Feeding failure diagnostics back to the authoring agent improves manipulation success
by up to **+35%**, validated on a real 6-DoF arm (RoboInspector, ACM TIST 2026,
[arXiv:2508.21378](https://arxiv.org/abs/2508.21378)). BotCortex records every task
attempt as an episode on the robot itself and recalls those lessons the next time it
learns — your robot gets better at *your* tasks, and the data never leaves your hardware.

## Status

v0 scaffold. Milestone 1 — primitives + mock robot + CLI smoke test — in progress.

## Layout

| Path | What it is |
|---|---|
| `botcortex/` | The Python package: primitives, skill store, episodic memory, authoring agent, CLI, server |
| `ui/` | (coming) Chat web app the robot serves on the local network |
| `tests/` | pytest suite — mock-mode only, no hardware required |

## Development

```bash
uv sync          # install everything
make test        # run the suite
botcortex --mock "wave right arm"   # (soon) mock-mode smoke test
```

Real motion always requires an explicit `--execute` flag and an operator present.
Dry-run is the default everywhere.

## License

Apache-2.0
