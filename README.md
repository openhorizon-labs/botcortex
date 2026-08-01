# BotCortex — Web

The web face of [BotCortex](https://openhorizon.so): teach your robot new tasks by
typing. Next.js + Bun + Tailwind + shadcn/ui, built as a static export.

The Python runtime lives in
[`botcortex-runtime`](https://github.com/openhorizon-labs/botcortex-runtime);
cloud services will live in `botcortex-api` (later).

| Path | What it is |
|---|---|
| `app/` | Routes — `/` is the marketing landing, `/app` is the chat app the robot serves |
| `components/site/` | Landing sections (hero, pillars, pricing, …) |
| `components/kit/` | Nano-interaction kit — `RunnerBadge`, `LiveDot`, `CopyCommand`, `Reveal`, `CountUp` |
| `components/ui/` | shadcn/ui primitives |

## Development

```bash
bun install
bun dev          # hot reload at localhost:3000
bun run build    # static export → out/
```

## Design system

Dark, warm-tinted near-black with a surface ramp (`surface-1/2/3`); depth from steps
and hairlines, never shadows. Signal amber accent — **red is reserved exclusively for
STOP**. Executor semantics are tokens (`runner-primitive`, `runner-policy`,
`runner-vla`, `runner-memory`, `runner-human`) so the multi-model hierarchy is legible
in the UI. Motion: 150 ms for state, 500 ms for entrances, all on `ease-standard`.

## Deployment

**Vercel**: import this repo with the default root directory — Next.js is auto-detected
and every push to main deploys. The build is a static export (`output: "export"`), so
the identical artifact is served by the robot locally (via the runtime's FastAPI
server) and by Vercel in the cloud.

## License

Apache-2.0
