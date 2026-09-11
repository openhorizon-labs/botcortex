# BotCortex — Web

The web face of [BotCortex](https://openhorizon.so): teach your robot new tasks by
typing. Next.js 16 App Router + Bun + Tailwind 4 + shadcn/ui.

**Start here for engineering work:** [Architecture audit and junior implementation guide](docs/ARCHITECTURE_AUDIT.md).
The follow-up findings and their fixes are recorded in [Claude implementation review](docs/CLAUDE_REVIEW.md#resolution--2026-09-11).

The Python runtime lives in
[`botcortex-runtime`](https://github.com/openhorizon-labs/botcortex-runtime);
account, inference, registry, and conversation services live in the separate
`botcortex-api` repository.

| Path | What it is |
|---|---|
| `app/` | Routes — `/` is the marketing landing, `/app` is the hosted control room |
| `components/app/` | Robot connection, chat, evidence export, STOP, and simulation |
| `lib/robot/` | Wire protocol, browser authoring loop, and WASM worker transport |
| `components/site/` | Landing sections (hero, pillars, pricing, …) |
| `components/kit/` | Nano-interaction kit — `RunnerBadge`, `LiveDot`, `CopyCommand`, `Reveal`, `CountUp` |
| `components/ui/` | shadcn/ui primitives |

## Development

```bash
bun install
bun dev          # hot reload at localhost:3000
bun test         # offline unit/regression tests
bun run typecheck
bun run build    # normal Next.js production build → .next/
bun run start    # production server; use a different port if dev is running
```

Set `API_URL` in `.env.local` to your account API (default:
`http://localhost:8787`; see `.env.example`). The landing and sign-in pages load
without it, but signed-in features require a running API and a provisioned account.
`/signup` is a waitlist, not account registration. Provider credentials belong in
the API/runtime, never a `NEXT_PUBLIC_` variable.

`bun dev` and `bun run build` vendor the installed Pyodide/MuJoCo assets and build
`public/sim-worker.js`. After changing worker code during dev, run
`bun run worker:watch` (or a one-off `bun run vendor`) and reconnect the browser
simulator. Signed in, the simulator keeps skills and episodes in IndexedDB under
your account; without an exclusive account-scoped storage lease, it runs session-only and says so in
the header. The wheel it boots is described by `public/botcortex/MANIFEST.json`,
which `bun test` checks against the file. CI (`.github/workflows/ci.yml`) runs the
same tests, typecheck and build on every push.

For isolated browser integration checks with Chrome installed and **port 8787 free**:

```bash
# Keep bun dev running with API_URL=http://localhost:8787 in another terminal.
bun scripts/audit-smoke.ts
bun scripts/review-smoke.ts
```

Run these sequentially: each temporarily binds an in-memory API/runtime fixture to
loopback and cleans up on exit. The audit smoke boots the real WASM simulator and
checks skill/episode persistence. The review smoke covers run ownership, failed
task creation/retry, idle heartbeat, server-bound writes and cross-tab account
changes. Both use fresh Chrome contexts and make no paid model calls.

Cloud writes and inference requests carry the originating account id. The browser
rechecks identity and `proxy.ts` verifies it against the cookie on the actual write
before forwarding. An account change resets the workspace and aborts its pending
work. Failed conversation creation is retryable while the tab remains open;
unsaved transcript work is still in memory and is discarded on reload/sign-out.

## Design system

Light grayscale with a surface ramp (`surface-1/2/3`), hairline borders, and black
primary actions. STOP uses the destructive token. Executor semantics are tokens (`runner-primitive`, `runner-policy`,
`runner-vla`, `runner-memory`, `runner-human`) so the multi-model hierarchy is legible
in the UI. Motion: 150 ms for state, 500 ms for entrances, all on `ease-standard`.

## Deployment

**Vercel**: import this repo with the default root directory. This is a normal
Next.js deployment: `proxy.ts` validates sessions and `next.config.ts` rewrites
same-origin `/api/*` requests to `API_URL`. Set the production API URL before the
build. Deployment is managed by the project owner in Vercel.

Canonical links prefer `NEXT_PUBLIC_PRODUCTION_URL`, then
`VERCEL_PROJECT_PRODUCTION_URL`, then `VERCEL_URL`, with localhost as the local
fallback. Direct robot WebSockets and the independent REST STOP endpoint are
separate from the account API. Hosted HTTPS-to-LAN connectivity needs a compatible
TLS endpoint; the relay option is not implemented.

## License

Apache-2.0
