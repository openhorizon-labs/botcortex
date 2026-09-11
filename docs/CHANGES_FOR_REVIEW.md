# BotCortex web — implementation pass for senior review

**Date:** 2026-09-11
**Reviewer:** gpt-6-astra (senior)
**Author:** Claude Fable 5.1, working from `docs/ARCHITECTURE_AUDIT.md`
**Scope:** this web repository only. Nothing in `botcortex-runtime` or `botcortex-api` was changed. Every place where a ticket's remaining work lives in those repositories is called out under "Not done, and why".

**Review follow-up:** the senior review found nine issues in this pass. They are documented, fixed and verified in [CLAUDE_REVIEW.md](CLAUDE_REVIEW.md#resolution--2026-09-11). The final suite has 156 unit tests plus both browser smoke scripts. This document preserves the original implementation record; its “web share done” summary does not supersede the review's remaining runtime/API roadmap.

## 1. How to read this

1. Section 2 is the one-screen summary: what changed, what was verified, what is still open.
2. Section 3 goes ticket by ticket in the audit's order (B01–B11), with the reasoning behind each decision and the files touched.
3. Section 4 lists the cross-cutting design choices a reviewer is most likely to challenge, with the alternative I rejected and why.
4. Section 5 is the verification record, with the exact commands.
5. Section 6 is the open list for the other repositories, phrased as the contract changes they need.

Numbers, file paths and claims below were produced by running the checks, not recalled. Where a claim could not be verified in this repository, it says so.

## 2. Summary

**State before this pass.** The audit's first pass (F01–F18) and the task-evidence export were in the working tree, uncommitted. 64 tests passed; the dev server was up; `/api/me` was unreachable because no account api was running locally, which the audit already recorded.

**What this pass did.** Implemented the web-repository share of all eleven B-tickets, in priority order, with regression tests for every behaviour that could be tested without a browser and a Chrome integration smoke for the rest. Protocol changes are additive (version 2): a peer on version 1 keeps working.

| Area | Before | After |
|---|---|---|
| Tests | 64 in 7 files | 123 in 11 files |
| Chrome smoke checks | 8 | 11 (durable account memory, STOP on `/app/device`, reconnect hydration added) |
| TypeScript, production build | pass | pass |
| Ticket coverage | F01–F18 fixed, B01–B11 open | B01–B11 web share done; remaining runtime/api items enumerated in §6 |

**Headline behaviours that now exist and did not before.**

- A run's events are filed under the task it was started from, not the task that happens to be open. Switching tasks mid-teach no longer moves history. (B01)
- Skills and episodes taught in the browser survive a reload, under the signed-in account's own IndexedDB store. A second tab, or a signed-out session, runs session-only and says so in the header. A failed flush is shown as "memory unsaved". (B02)
- Transcript writes that fail are counted, shown, and retryable; a skill that never reached the registry is listed with a retry; a key revocation that fails says the key still works. (B04)
- A hung worker settles with an actionable error within a documented deadline and is shut down; a STOP mid-carry restores the objects as well as the arm. (B05)
- Robot addresses are parsed into a validated structure: explicit `ws://` and `wss://` are honoured, IPv6 literals work, credentials and paths are refused with a reason, a half-open socket is labelled stale and then closed, retries back off exponentially, and a manual connection choice can no longer be overridden by late auto-discovery. (B06)
- STOP is rendered at the layout level, so it is present on `/app/device`; its state distinguishes pending, latched, and unknown, and names whether it is stopping a simulation or a hardware path. (B07)
- The 3D view disposes what it allocates, removes bodies the robot stops reporting, refuses to draw a non-OpenArm platform as an OpenArm, and shows a fallback when the model fails to load. (B08)
- The wheel's contract is validated at boot; model replies are validated at the boundary; tool arguments are checked against the wheel's own JSON Schema before dispatch; the model announced to the owner is the one the api says it served. (B09)
- Public copy no longer promises a robot-served UI, plan review before motion, a 12–20 ms control loop, an unmeasured 35% uplift, or "we never resell inference". (B10)
- CI runs tests, typecheck, and a production build on a pinned Bun with a frozen lockfile; the committed wheel has a manifest and a test that fails on a mismatch; a worker watch script exists. (B11)

## 3. Ticket by ticket

### B01 — Bind execution to its originating task

**Problem.** The provider filed every incoming `chat`, `tool` and `tool_result` under `conversationIdRef.current`, the task currently selected in the sidebar. Start a teach in A, click B, and A's remaining events were written into B.

**Change.**
- `lib/robot/protocol.ts`: `chat` and `run_skill` client messages carry an optional client-minted `runId`. Runtime events `status`, `chat`, `tool`, `tool_result`, `model`, `plan`, `step` carry an optional `runId`. `PROTOCOL_VERSION = 2`. All additive; the decoder validates the field as an optional string.
- `components/app/robot-provider.tsx`: a `RunBinding` is created at the instant of send — before the thread exists on the api — holding the thread promise, the resolved id once known, and the selection epoch at that moment. Events resolve their run by `runId` when present, else the most recent run this client started. Persistence uses the run's thread promise; display uses `onScreen(run)`, which compares the resolved id, or the epoch while the id is still in flight. `liveCallsRef` keeps every in-flight tool call regardless of visibility so a late result can still be filed with its arguments. `activeRun` is exposed and the header links to the task the robot is working in when it is not the one on screen.
- `lib/robot/browser-sim/transport.ts`: stamps the current run's id onto run-scoped events (`RUN_SCOPED`), never onto `hello`, `state`, `skills`, `memory`.

**Why this shape.** The alternative was to make persistence asynchronous on thread resolution and drop the epoch. That loses the ability to answer "is this run's task on screen" synchronously in the sub-second window between pressing send and the create round-trip landing, which is exactly the window the audit's reproduction uses. The epoch is a monotonic counter bumped by `selectThread`; it is not a substitute for a runtime `sequence`, and the audit's items 2 and 4 (event ids, gaps on reconnect) remain runtime work.

**Known limit.** Switching back to A while A's run is still posting rows can race the reload; the row lands, and a later open shows it. Documented in code.

### B02 — Durable, account-isolated browser memory

**Problem.** The worker wrote `/data/skills` and `/data/episodes.jsonl` to Pyodide's MEMFS. Reload, and the skills the owner just watched being taught were gone while the transcript said they existed.

**Change.**
- `lib/robot/browser-sim/worker.ts`: `boot` takes a `namespace`. With one, `/data/<encoded namespace>` is mounted as IDBFS and `syncfs(true)` is awaited **before** `RobotSession` is constructed, so the first `list_skills` sees the hydrated store. `flush()` runs `syncfs(false)` after `save_skill`, `run_skill` (proof files), `log_lesson`, and `logEpisode`, and returns `{flushed, error}` with the reply. The STOP file moved from `/data/STOP` to `/run/STOP` (MEMFS): a persisted latch would stop the next session's robot from a stop nobody pressed.
- `lib/robot/browser-sim/host.ts`: passes the namespace, exposes `memory: {durable, error}` from the boot reply and `memory` per tool reply.
- `lib/robot/browser-sim/transport.ts`: resolves the namespace from `/api/me` (4 s deadline; null when signed out or the api is away), takes a Web Locks lease (`botcortex.sim.memory`, `ifAvailable`) and boots session-only if another tab holds it, emits a new `memory` message after `hello` and whenever a flush fails.
- `lib/robot/protocol.ts`: `{ type: "memory"; durable; unsaved; detail? }`.
- `components/app/status-strip.tsx`: shows "session-only memory" or "memory unsaved" with the reason.

**Verification.** The Chrome smoke boots the real wheel signed in as fixture user `audit`, asserts no session-only warning, asserts `indexedDB.databases()` contains `/data/audit`, disconnects, reconnects, and asserts the second boot is still durable. Host and transport unit tests cover the namespace hand-off, the memory report, and the unsaved-flush event.

**Not done.** Hydrating executable skills from the account registry on a fresh browser needs `GET /api/skills`; the api only has `POST`. Conflict/version semantics belong with that endpoint.

### B03 — Enforce review-before-run in the runtime

**Change.** Only item 5 is web work: the command palette's "Toggle dry run" is removed with a comment explaining why (no backend reads `dryRun`; a hidden safety state that does nothing is worse than none). The `dryRun` plumbing stays for the runtime to honour later. Items 1–4 are runtime and api work and are listed in §6.

### B04 — Make persistence and sync failures recoverable

**Problem.** `persist` and `persistTool` ignored non-2xx; sync failures reached only the console; key revocation ignored the response; history was capped at 200 rows with no signal.

**Change.**
- `lib/robot/outbox.ts` (new, tested): an in-memory outbox keyed by the api's de-dup id. Transient statuses (408, 425, 429, 5xx) and network errors retry with bounded exponential backoff (5 attempts, 15 s cap); 4xx rejections are not retried and are reported with a reason (401/403 as "signed out"); the same key never double-sends while in flight; `retryFailed()` re-drives failures. Retrying cannot change what a row means: the body is captured once.
- `robot-provider.tsx`: both persist paths go through the outbox; `persistence` state and `retryPersistence` are exposed. History is requested at the api's cap (500) and `historyTruncated` is set when the cap is hit; the workspace shows a notice above the transcript.
- `sync` messages maintain `syncFailures`; `retrySync(name)` sends a new `sync_skill` client message that the browser sim honours from the skill revision captured at save time (no racing `list_skills`).
- `robot-keys-panel.tsx`: revocation checks `response.ok`; failure says the key still works; the row shows a spinner while revoking.

**Why in-memory.** The audit asked for an account-scoped durable outbox. The provider does not know the account id without a round-trip, and a durable outbox that replays after sign-out into a different account is the ownership hazard the audit rules out. In-memory with visible counts is the honest version: a reload drops it, and the header said so before the tab closed.

**Not done.** Cursor pagination: `/api/messages` accepts only `limit` (≤ 500).

### B05 — Bound worker work and restore the complete stopped scene

**Change.**
- `host.ts`: `DEADLINES_MS` per request type (boot 240 s, callTool 120 s, others 15 s). A request past its deadline rejects with a sentence naming the deadline, every other in-flight call is rejected with the same reason, the worker is terminated, and `onDead` fires once. Exposed for tests.
- `transport.ts`: on death, tells the owner to reconnect, closes, and calls the provider's `onDead`, which marks the connection as errored. Previously the provider would have kept showing "connected" over a dead worker.
- `worker.ts` `seek` now also restores object poses via the runtime's own `scene.place_objects`, with the poses the host displayed at the abort frame. `host.ts` `seekToShown()` sends both.

**Why terminate rather than interrupt.** Pyodide can only be interrupted with a `SharedArrayBuffer`, which needs COOP/COEP on the whole app and would need the embedded Tally and Cal.com pages checked first. Termination is the recovery that exists today; the audit's interrupt path stays open.

**Honesty note.** `seek` still writes through `_write_qpos` and `_object_addr`, which are private to the wheel. The audit is right that a public snapshot API belongs in the runtime; this pass extends the existing interim path rather than adding a second one.

### B06 — Make connection identity and liveness explicit

**Change.**
- `protocol.ts`: `parseRobotEndpoint(raw, pageProtocol)` returns `{host, secure, explicitScheme}` or a reason. Explicit `ws`/`wss`/`http`/`https` wins; without a scheme, the page's protocol decides. Uses the WHATWG URL parser for the authority, so IPv6 literals are bracket-normalised and ports are validated. Refuses credentials, query, fragment, any path beyond `/`, spaces, and zone ids. `mixedContentBlocked` now understands an explicit plain scheme on an https page (blocked for everything but loopback) and private IPv6 ranges. `normalizeHost`, `wsUrl`, `httpUrl` are kept as thin wrappers.
- `robot-provider.tsx`: stores the endpoint, remembers scheme choice in localStorage and re-dials it exactly; heartbeat pings every 5 s, marks telemetry stale after 3 s of silence, closes a socket silent for 15 s so the retry path takes over; retry delay is 1, 2, 4, 8, 15 s instead of a flat 3 s; the TLS failure message tells the owner to type `ws://` if the runtime serves plain sockets; `manualChoiceRef` stops the auto-connect chain from overriding a manual connect or the in-tab sim.
- `protocol.test.ts`: a table over page protocol × address shape × explicit scheme, and a rejection table.

**Not done.** The relay and any origin/authorization checks on the runtime's `/ws` are api/runtime work.

### B07 — Keep STOP available across the whole control-room shell

**Change.**
- `app-shell.tsx` renders `<StopControl />` (inside a `TooltipProvider`) beside the route children, so `/app/device` has it. The workspace no longer renders its own.
- `robot-provider.tsx`: `stopState: "clear" | "pending" | "latched" | "unknown"`. Latched only on runtime acknowledgement (estop event, hello, or 200 from `/stop`); pending while the request is in flight; unknown when the socket drops while latched. `stopped` is derived (`latched || unknown`) so every existing guard still blocks motion in the unknown case.
- `stop-control.tsx`: names the backend ("Simulation in this tab", "Mock robot", "<platform> (hardware path)"), says "Stop state unknown" with a reconnect instruction, shows "Stopping…" while pending, states in the tooltip that it is not a physical emergency stop, and renders nothing only when there is nothing to stop and nothing connected.

**Verification.** The smoke loads `/app/device` in a fresh document with a remembered robot and asserts the STOP button is present and enabled. A hook-order bug I introduced (early return before `useEffect`) was caught by this smoke and fixed before commit.

### B08 — Dispose 3D resources and handle scene replacement

Implemented by a parallel agent under my direction; I reviewed the diff.

- `sim-view.tsx`: `disposeTree()` frees geometry, materials and textures. `ArmModel` cancels late callbacks, disposes the loaded robot and the Draco decoder on unmount, and reports load failures. `Workcell` tracks size and colour per body, replaces geometry on size change, updates colour in place, removes bodies no longer reported, disposes on unmount. `ARM_PLATFORMS = {openarm_v1, wasm, mock}` gates the arm; other platforms get the workcell plus a "No 3D model for platform X" status overlay. A "3D model failed to load" status is shown on error.
- `sim-panel.tsx`: loading fallback has `role="status"`.
- `scripts/shoot-sim.ts`: `waitForFunction` options were in the `arg` slot, so the timeout was ignored; fixed.

### B09 — Tighten external contracts and model attribution

**Change.**
- `agent/contract.ts`: `contractProblem()` names the first violated field: version string, non-empty prompt, integer `max_iterations` in 1..500, `max_follow_ups` in 0..20, non-empty `failure_prefixes`, at least one tool, snake_case unique tool names, object parameter schemas. `parseContract` distinguishes "not JSON" from "malformed (reason)". A test unzips the shipped wheel and asserts it passes.
- `agent/schema.ts` (new, tested): a small JSON Schema checker for required keys, primitive types (integer satisfies number), nested objects/arrays, enums, and `additionalProperties: false`. Deliberately not a full validator; the runtime's own argument checks remain the authority.
- `agent/loop.ts`: `readReply()` validates the envelope (choices, message, `tool_calls` shape) and produces one sentence on failure. Arguments are checked against the tool's schema before dispatch; a shape failure goes back to the model as the tool result. The `model` event is now emitted from the api's reply (`data.model`, `data.provider`) after the first response, never from the request; `TeachOutcome.ranOn` carries it. Tests cover attribution, a malformed envelope, and schema rejection.
- `model-picker.tsx`: re-fetches the catalogue whenever `credit.balanceMicros` changes, so affordability follows spend.

**Not done.** Authoritative usage/billing in the reply is api work; the loop reads `model` and `provider` if present and falls back to the request otherwise, which is stated in code.

### B10 — Align public claims with shipped behavior

Implemented by a parallel agent under my direction; I reviewed every old→new pair.

- Removed: "served from the robot", "review the plan before anything moves", "12–20 ms control loop", "open source", "we never resell inference", "offline ok", an "8 ms ACT policy" step.
- Replaced with: hosted control room, watch every step as it works (generated code visible), zero model calls when a taught skill runs, "up to 35% in RoboInspector's evaluated setting (arXiv 2508.21378) — not a BotCortex measurement", "bring your own model key or teach with metered BotCortex credit — taught skills run free", policy/VLA badges labelled planned, "every robot today is a simulation twin; hardware motion is not yet wired".
- `app/simview-preview/page.tsx`: `robots: { index: false, follow: false }`.
- Left for the product owner: the Pro price and feature list, the "$19,000–$80,000 per task" comparison.

### B11 — Make verification repeatable in CI

Implemented by a parallel agent under my direction; I reviewed the files.

- `.github/workflows/ci.yml`: push to main and PRs; `oven-sh/setup-bun@v2` pinned to 1.3.5; `bun install --frozen-lockfile`; `bun test`; `bun run typecheck`; `bun run build`. The Chrome smoke is documented as manual.
- `public/botcortex/MANIFEST.json`: wheel name, SHA-256, contract version 0.0.1, platform openarm_v1, runtime commit `a3949d4` (the agent verified the wheel in `botcortex-runtime/dist` has the identical hash and its extracted tree is byte-identical to `git archive HEAD`).
- `lib/robot/wheel-manifest.test.ts`: hashes the wheel and unzips the contract; fails on mismatch (verified by altering the hash, then restoring it).
- `scripts/worker-watch.ts` and `bun run worker:watch`.

### Incidental fix

- `workspace.tsx`: the avatar initial crashed the whole control room for a session with neither name nor email (`(name || email)[0]`). Found by my own diagnostic fixture; guarded with a fallback.

## 4. Design decisions a reviewer may challenge

1. **`runId` is client-minted.** The audit suggested a runtime-generated id bound to a client command id. A client id is what lets the binding exist before the runtime answers, and a runtime that echoes it is enough for correlation. If the runtime later mints its own, it can return both. Additive either way.
2. **Epoch, not thread id, for the display decision.** See B01. The epoch is only used for "on screen or not"; persistence always waits for the real id.
3. **In-memory outbox.** See B04. Durable replay across sign-out is the ownership hazard; visible loss is the honest fallback.
4. **Web Locks for the single-writer lease.** `navigator.locks` is supported in every current browser; where absent the transport assumes a single tab. The alternative, a heartbeat row in IndexedDB, needs polling and still races.
5. **Namespace from `/api/me`, not from the session cookie.** The cookie is opaque to the browser (httpOnly) and the api owns identity. A 4 s deadline keeps boot from hanging on an unreachable api.
6. **Termination as the worker deadline recovery.** See B05. Interrupts need COOP/COEP, which the audit flags for a separate compatibility check.
7. **STOP is never hidden while it could matter.** It returns null only with no connection and a clear latch, so the device page is not decorated with a dead button, but a latched or unknown stop stays visible even when disconnected.
8. **Model attribution moved after the first reply.** The composer's "ran on" notice no longer appears before anything ran. The cost: a teach that fails before any reply has `ranOn: null` and shows nothing, which is the truthful state.
9. **`ARM_PLATFORMS` includes `wasm` and `mock`.** Those strings are what the browser sim and mock runtime report today. If the runtime standardises platform ids, this set shrinks to `openarm_v1`.

## 5. Verification record

Run from the repository root with `bun dev` already serving `localhost:3000` and `API_URL` at its default.

```bash
bun test                    # 123 pass, 0 fail, 11 files
bun run typecheck           # clean
bun run build               # clean; static routes + dynamic /app/tasks/[id]; proxy present
bun scripts/audit-smoke.ts  # 11 checks passed, pageErrors: [], sim boot ~1.9 s locally
```

Smoke checks, in order: public navigation; stale history isolation; evidence download; delete navigation; STOP failure feedback; REST STOP after socket loss; real WASM boot; sim STOP/reset; durable account memory (no session-only warning, `indexedDB.databases()` contains `/data/audit`); STOP on `/app/device`; reconnect hydration.

Public routes during the pass: `/`, `/signin`, `/demo`, `/simview-preview` returned 200; `/app` without a cookie redirected to `/signin?next=%2Fapp`. The dev server was never stopped.

Not exercised: a real account api, a paid model, a physical robot. The smoke's fixture is loopback-only and in-memory.

## 6. Open work in the other repositories

Phrased as the change each one needs, so the web side does not have to be revisited.

**botcortex-runtime**
- Echo `runId` from `chat`/`run_skill` on `status`, `chat`, `tool`, `tool_result`, `model` (B01). Add `eventId` and a monotonic `sequence` per run so the web can detect gaps on reconnect.
- Publish backend capabilities in `hello` (simulation/hardware, dry-run support, approval support, platform and protocol versions) and implement proposal → approval → execution with approval bound to code hash, parameters, robot identity, scene revision, expiry (B03).
- A public snapshot/restore API on the sim robot, replacing `_write_qpos` + `place_objects` writes from the worker (B05).
- Origin/authorization on `/ws` and `/stop` for direct hosted-app connections (B06).
- Emit a `memory` message from real runtimes only if their storage can fail; otherwise the web treats a robot's disk as durable.

**botcortex-api**
- `GET /api/skills` (name, description, code, platform, updatedAt) for registry hydration (B02).
- Cursor pagination on `GET /api/messages` (B04).
- Return authoritative `model`, `provider`, and usage in `/api/inference/chat` replies; the web already reads `model` and `provider` when present (B09).

**Product owner**
- Pro tier price and feature list; the integrator-quote comparison; sign-off on the current/planned capability table (B10).

## 7. Files changed

New: `components/app/status-strip.tsx`, `lib/robot/outbox.ts` (+test), `lib/robot/agent/schema.ts` (+test), `lib/robot/agent/contract.test.ts`, `lib/robot/wheel-manifest.test.ts`, `public/botcortex/MANIFEST.json`, `.github/workflows/ci.yml`, `scripts/worker-watch.ts`, this document.

Modified (this pass): `lib/robot/protocol.ts` (+tests), `lib/robot/agent/contract.ts`, `lib/robot/agent/loop.ts` (+tests), `lib/robot/browser-sim/worker.ts`, `host.ts` (+tests), `transport.ts` (+tests), `components/app/robot-provider.tsx`, `app-shell.tsx`, `stop-control.tsx`, `workspace.tsx`, `robot-keys-panel.tsx`, `model-picker.tsx`, `sim-view.tsx`, `sim-panel.tsx`, `components/site/{features,hero,hero-card,pricing}.tsx`, `app/simview-preview/page.tsx`, `scripts/audit-smoke.ts`, `scripts/shoot-sim.ts`, `package.json`, `README.md`, `docs/ARCHITECTURE_AUDIT.md`.

The first-pass files (F01–F18, evidence export, proxy tests, auth redirect) are committed together with this pass because they were never committed on their own; their rationale is in the audit's §4.
