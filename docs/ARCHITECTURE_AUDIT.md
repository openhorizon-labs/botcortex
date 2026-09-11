# BotCortex: architecture audit and implementation guide

**Latest verification:** the follow-up review's R1–R9 fixes pass 156 unit tests, TypeScript, production build, and both Chrome smoke suites. See [review findings and resolution](CLAUDE_REVIEW.md#resolution--2026-09-11) for current evidence and the remaining cross-repository roadmap. Earlier test counts below describe their respective audit passes.

**Date:** 2026-09-11  
**Audience:** junior developers, reviewers, and the product owner  
**Scope:** this web repository, its bundled browser-runtime integration, and public research  
**Status:** initial fixes and task-evidence export implemented; a second pass (same day) implemented the web-repository share of every ticket below. See [ticket status](#ticket-status-after-the-implementation-pass) and `docs/CHANGES_FOR_REVIEW.md` for the change-by-change account.

## 1. Start here

1. Read the [system map](#3-system-map) and [engineering rules](#10-engineering-rules).
2. Run the commands in [verification](#8-verification-and-local-development).
3. Pick one open ticket in [the backlog](#6-open-bugs-and-actionable-tickets), in priority order.
4. Include its reproduction, change, and acceptance-test results in your review.

**Architectural conclusion:** the shared Python wheel and agent contract are valuable foundations. The largest gaps are the lifecycle and evidence around execution: who owns a running task, whether STOP was acknowledged, whether memory survived, and whether a claimed success is backed by a verifiable outcome.

**Differentiation recommendation:** build an owner-controlled, evidence-driven deployment workflow: teach → record what actually happened → reproduce a failure → test a repair → approve a version → reuse locally. Code generation, skill libraries, and repair loops already have substantial prior art. Our opportunity is the quality, portability, and measured reliability of this complete workflow.

### Priority definitions

- **P0:** prerequisite for hardware-enabled operation or trustworthy execution claims.
- **P1:** correctness, data loss, authentication reliability, or a core product promise.
- **P2:** usability, performance, developer experience, or lower-impact correctness.

Estimates below are focused engineering days for one developer familiar with the relevant repository. Cross-repository reviews and hardware validation add elapsed time.

## 2. Audit coverage and limits

### What was checked

- Enumerated all tracked files and inspected the working-tree state before changes.
- Reviewed routing, Next configuration, auth proxy, sign-in, device approval, account UI, and metadata.
- Deep-read the provider, workspace, composer, tool traces, STOP, browser transport, worker, host, agent loop, contract, and protocol.
- Reviewed the Three.js/URDF scene, public assets' integration, runtime-vendoring scripts, mock runtime, and existing tests.
- Reviewed marketing/navigation copy and scanned the component kit and UI integration for effects, timers, external requests, and unsafe rendering patterns.
- Read the installed Next.js guides for client/server boundaries, authentication/proxy, and Turbopack root configuration before edits.
- Ran unit tests, TypeScript, a production build, public-route checks, and an isolated Chrome integration script including the actual WASM simulator.

### Boundaries of the conclusions

This is a repository-wide inventory with deeper review of first-party behavior, not an exhaustive verification of every generated UI component, third-party dependency, binary mesh, or line inside the Python wheel. `node_modules/`, generated build output, and cached research are not application source audits.

The separate `botcortex-api` and `botcortex-runtime` source repositories were not audited or changed. Their authorization, billing, sandbox, and physical control guarantees need their own checks. No physical robot or live paid model was exercised. A simulated trajectory is not evidence of real-world safety or sim-to-real equivalence.

At baseline, `/api/me` returned HTTP 500 because the configured local upstream at `localhost:8787` was not running (`ECONNREFUSED`). The browser integration checks used an explicitly disposable API fixture. They verify frontend behavior, not the real account service.

## 3. System map

```text
Public pages                  Hosted control room (/app)
app/, components/site/       components/app/workspace.tsx
                                      |
                             RobotProvider (layout lifetime)
                             /                       \
                    Direct WebSocket              BrowserSimTransport
                    /ws to runtime                agent loop on main thread
                    REST /stop                    inference through /api/*
                             \                       /
                              same RobotMessage vocabulary
                                                       |
                                                 BrowserSim host
                                                 trajectory playback
                                                       |
                                                 module Web Worker
                                                 Pyodide + MuJoCo
                                                 bundled Python wheel

Next proxy.ts -> /api/me session check
Next /api/* rewrites -> botcortex-api
                       auth, conversation history, model catalogue,
                       credits, inference, skill registry
```

### Good foundations to preserve

- The model is an authoring component; deterministic primitives own execution.
- The browser reads the prompt/tool contract from the same wheel as its Python executor.
- The simulator and WebSocket runtime share a protocol and frontend message handling.
- Joint/scene telemetry uses refs rather than re-rendering the entire app at 15 Hz.
- STOP has its own runtime HTTP path.
- Runtime verification can reject unsupported final success claims.
- Session cookies are proxied same-origin instead of depending on third-party cookies.

### Structural pressure points

- `robot-provider.tsx` combines transport lifecycle, auth-adjacent API data, conversation persistence, scene state, and session UI choices. Extract these around behavior, with integration tests first.
- `RobotMessage` has no task/run identifier, sequence, acknowledged command ID, or final structured outcome. Those omissions limit durable evidence and correct reconnect handling.
- TypeScript describes shapes but does not validate external data by itself. The WebSocket decoder is now checked; API responses and worker/model contracts still need more validation.
- Several comments, marketing claims, and README statements described a robot-served static-export product. The current deployment is hosted Next.js. README is corrected; remaining public claims are ticketed.

## 4. Changes implemented in this audit

“Fixed” here means the listed behavior was addressed, not that the entire surrounding subsystem is complete.

| ID | Priority | Confirmed issue | Change and location | Verification |
|---|---|---|---|---|
| F01 | P1 | Invalid JSON tool arguments became `{}` and still reached execution; JSON `null`/arrays also passed through | Reject malformed/non-object arguments and unoffered tool names; `lib/robot/agent/loop.ts` | Regression cases for invalid shapes and unknown tools |
| F02 | P1 | Iteration exhaustion could be recorded as success; STOP during final verification/last tool could be missed | Exhaustion returns `iteration_limit`; abort checked at final boundaries | Agent-loop tests |
| F03 | P1 | Closing a simulator while it booted could leak a late worker/ticker and emit a stale hello | Late boot closes itself; transport suppresses events after close; provider checks connection identity | Transport lifecycle tests |
| F04 | P1 | Worker boot errors leaked resources; post-close calls could wait forever; playback continued after close | Boot cleanup, closed-state rejection, playback abort; `browser-sim/host.ts` | Host tests, real WASM boot |
| F05 | P1 | Simulator job failures escaped fire-and-forget callers | Catch, explain, and restore idle; serialize resets; refresh skill proof state after Run | Transport tests |
| F06 | P1 | Skill-registry HTTP errors looked like successful fire-and-forget sync | Check `response.ok` and emit `sync` outcome; `transport.ts` | Type/build check; user-visible retry remains B04 |
| F07 | P1 | External WebSocket JSON was cast to a trusted type; malformed payloads could crash chat or scene | Runtime decoder checks message, vector, numeric and gripper shapes; `protocol.ts` | Protocol regressions |
| F08 | P1 | Old callbacks/retry timers could contaminate a new robot connection; sockets survived provider unmount | Cancel retries, ignore stale callbacks, clear scene refs and tear down on unmount; wait for valid hello | Lifecycle review, browser runtime/simulator switching |
| F09 | P1 | Out-of-order history loads replaced the selected task; deleting a task left a stale URL | Version/id guards, invalidate loads on new messages, ignore failed deletes, navigate to replacement task | Chrome delayed-history and deletion checks |
| F10 | P1 | Conversation creation used a discarded rejecting `.finally()` promise and could navigate after a task switch | Handle settlement without an unobserved rejection; epoch guard against late navigation | Type/build check; active-run routing remains B01 |
| F11 | P0 before hardware | STOP failure was invisible; REST STOP disabled when WebSocket disconnected; HTTP success did not latch local state | Acknowledged stop/reset, 4-second HTTP deadlines, visible failure feedback, REST stop remains available after socket loss | Chrome 500/200 responses, socket loss, real simulator STOP/reset |
| F12 | P1 | Auth-service outages erased valid session cookies | Distinguish invalid from unavailable, bound check to 4 seconds, return 503 without deleting cookie on outage | Proxy tests |
| F13 | P1 | A sign-in `next` beginning `/\\` passed the slash check despite URL normalization; errors could leave forms busy | Parse same-origin `/app` destinations, reject unsafe forms; catch sign-in and device-decision network errors | Redirect tests, type/build check |
| F14 | P1 | Proxy's extension exclusion also matched dotted paths under `/app` | Explicit `/app/:path*` matcher | Configuration/type/build check |
| F15 | P2 | Composer allowed sends while busy and Enter during IME composition | Busy/stopped guards, IME-aware Enter, input labels | Type/build check |
| F16 | P2 | Marketing nav anchors pointed inside `/signup` or `/demo`, where sections do not exist | Use `/#features`, `/#how`, `/#pricing` | Chrome navigation check |
| F17 | P2 | Canonicals could use a transient preview domain; Turbopack inferred the user's home directory as root | Prefer Vercel production host, explicitly set project root | Production build, dev-server startup |
| F18 | P2 | README described static export and an obsolete dark design | Correct setup, architecture, deployment and checks; add `.env.example` and `typecheck` script | Reviewed against current code |

The local Turbopack dev cache became unresponsive during the configuration/build pass. Restarting alone did not recover it. Moving the generated dev cache aside and restarting restored normal responses. This was an observed local cache issue; no root-cause claim about Next.js is made. The development server remains running.

## 5. New feature: portable task evidence

Implemented in:

- `lib/robot/evidence.ts`: deterministic summary and versioned export projection.
- `components/app/task-evidence.tsx`: chat-level summary and Download evidence action.
- `components/app/chat-pane.tsx`: integration with live and rehydrated tool traces.
- `lib/robot/evidence.test.ts`: failure/lesson, unknown-result, ordering and export tests.

The panel counts completed, failed, pending and unknown tool results, plus successfully recorded lessons. It exports the loaded tool arguments, generated code, results, IDs and observation timestamps as JSON.

### Important semantics

```json
{
  "schemaVersion": 1,
  "kind": "botcortex.task-evidence",
  "scope": "loaded-task-trace",
  "source": "browser-observed-or-rehydrated-tool-events",
  "taskCompletion": "not-attested"
}
```

- A successful `log_lesson` is evidence that a lesson was recorded, not that the failed manipulation succeeded.
- A missing legacy verdict is unknown, not success.
- The individual tool-trace badge also shows “Outcome unknown” when a stored result has no verdict.
- The export is a snapshot of currently loaded history, which may be incomplete.
- Current robot/model state is deliberately not retroactively attached to old tasks: the protocol does not establish that provenance.
- It is unsigned, contains no full physics snapshot, and is not a replay capsule or execution certificate.

**Junior acceptance test:** open a task with one failed tool and one recorded lesson. Download evidence. Expect `failed: 1`, `lessonsRecorded: 1`, and `taskCompletion: "not-attested"`. Reloading a task with stored traces should still expose the panel. The fixture smoke script checks this.

This is the first implementation slice toward the evidence-backed workflow, not a claim of globally novel technology.

## 6. Open bugs and actionable tickets

### Ticket status after the implementation pass

Same-day second pass, 2026-09-11. "Web done" means every action a change to this repository could deliver is implemented, tested, and listed in `docs/CHANGES_FOR_REVIEW.md`; "needs runtime/api" names the exact remaining work in the other repositories. Nothing below claims hardware readiness.

| Ticket | Web status | Still open elsewhere |
|---|---|---|
| B01 run binding | Web done: client-minted `runId` on `chat`/`run_skill` (protocol v2), events file under the run's originating task, running task discoverable from any view, offline create produces no unhandled rejection | Runtime must echo `runId` on `status`/`chat`/`tool`/`tool_result`/`model` (the browser sim does); `eventId`/`sequence` and reconnect gap detection need the runtime to number events |
| B02 durable browser memory | Web done: account-scoped IDBFS mount awaited before the session boots, flush after every persisting tool with failure surfaced as "memory unsaved", STOP file outside durable storage, single-writer Web Locks lease with the second tab booting session-only | Registry hydration needs `GET /api/skills` on the api (only `POST` exists); conflict/version semantics belong there too |
| B03 review-before-run | Web done for item 5 only: the nonfunctional "Toggle dry run" palette action is removed | Items 1–4 are runtime work: capabilities, immutable proposals, approval binding, rejection without approval |
| B04 recoverable persistence | Web done: outbox with idempotent keys, bounded retry on transient status, visible pending/failed counts with retry, sync failures listed with retry from the captured revision, key revocation checked, history cap detected and announced | Cursor pagination needs an api change (`/api/messages` accepts `limit` ≤ 500 only) |
| B05 bounded worker | Web done: per-request deadlines, terminate-and-report recovery, STOP rewinds arm AND object poses, abort cannot be cleared by reset mid-run | A public snapshot API in the wheel (replacing the `_write_qpos`/`place_objects` path), Pyodide interrupts under COOP/COEP |
| B06 connection identity | Web done: validated `RobotEndpoint` with explicit scheme, bracketed IPv6, credential/query/fragment rejection, actual TLS error text, heartbeat with stale label and half-open close, bounded exponential backoff, manual choice beats late discovery, table-driven tests | Authenticated relay and direct-runtime origin checks are api/runtime work |
| B07 STOP across the shell | Web done: layout-level STOP, pending/latched/unknown states, simulation vs hardware label, REST STOP after socket loss, verified on `/app/device` in the Chrome smoke | Physical stop and operator presence remain runbook items |
| B08 3D disposal | Web done: geometry/material/texture/decoder disposal, absent bodies removed, changed size/colour updated, unsupported platform overlay, load-failure fallback, screenshot helper timeout fixed | — |
| B09 contracts and attribution | Web done: strict contract validation at boot, model envelope validation, arguments checked against the wheel's JSON Schema before dispatch, model announced from the api's reply, affordability refreshed on balance change | Authoritative usage/billing in the reply belongs to the api |
| B10 public claims | Web done: robot-served, plan-review, 12–20 ms, unmeasured uplift and "never resell inference" claims removed or attributed; preview page noindexed | Pro pricing figures and the integrator comparison await the product owner |
| B11 repeatable verification | Web done: CI workflow (pinned Bun, frozen lockfile, tests, typecheck, build), wheel manifest with SHA-256/contract/runtime commit plus a test that fails on mismatch, worker watch script | Chrome smoke stays manual until CI has a browser |

### B01 — Bind execution to its originating task

**P1 · web + runtime + API · 3–5 days**

**Evidence:** `RobotProvider.handleMessage`, `append`, `persistTool`, and `ensureConversation` file events against the selected conversation. The wire protocol carries no `runId`/`conversationId`. The load-response race is fixed, but changing tasks while teaching can still redirect subsequent live events into another task.

**Reproduce:** begin a long teach in A; select B or New task; let A produce another chat/tool event. Inspect which conversation receives it, including persisted rows.

**Actions:**
1. Introduce a client command ID and runtime-generated `runId`; bind it once to the originating conversation.
2. Put `runId`, `eventId`, and monotonic `sequence` on execution events; version the protocol.
3. Persist by run binding, not selected UI state. Reopening B must only change what is displayed.
4. Add idempotency on `(runId, eventId)` and detect replay/gaps on reconnect.
5. Extract a conversation store and a transport controller from the provider after behavior is pinned.

**Done when:** late events, duplicate delivery, reconnect, A→B→A and deletion during a run never move or duplicate history. An offline create failure produces no unhandled rejection. A currently running task remains discoverable from any view.

### B02 — Durable, account-isolated browser memory

**P1 · web, API for recovery · 3–5 days**

**Evidence:** `worker.ts` writes `/data/skills` and `/data/episodes.jsonl` into Pyodide's default in-memory filesystem. There is no persistent mount or hydration from `/api/skills`. `persistSkill` copies some skills to the registry, but nothing restores them when a new worker boots. Pyodide documents that MEMFS data is lost on reload [R7].

**Reproduce:** teach/save a skill or log a lesson, disconnect/reconnect the browser simulator, and inspect skill names/recall. The cloud transcript can remain while executable skills and local memory disappear.

**Actions:**
1. Resolve an authenticated account namespace before opening durable storage. Do not share a global `/data` store between accounts.
2. Mount account-scoped IDBFS (or explicitly selected OPFS-backed persistence) and await hydration before constructing `RobotSession`.
3. Serialize flushes after skill/episode/lesson changes; surface quota or flush failures as unsaved state.
4. Keep STOP state separately scoped; never accidentally inherit another robot's latch or clear an active run by restoring storage.
5. Define registry conflict/version behavior; hydrate executable skills and metadata on a fresh browser.
6. Cover multiple tabs with a single-writer lease or conflict detection and test sign-out/account switching.

**Done when:** a saved skill and failed episode survive reload; failed flush is visible; account B cannot read A's local files; reconnect does not overwrite a newer skill. Test offline, private browsing, quota failure and two tabs. Downloaded evidence is not a substitute for this persistence.

### B03 — Enforce review-before-run in the runtime

**P0 before hardware · runtime + web · 5–8 days plus hardware validation**

**Evidence:** `RobotProvider` intentionally drops `plan`/`step`; its comment says no plan emitter exists yet. `BrowserSimTransport.send` ignores `dryRun`, and `Composer` correctly labels today's path Simulation instead. The command palette still toggles a hidden dry-run state. Marketing says the owner sees the plan before anything moves.

**Actions:**
1. Runtime publishes explicit backend capabilities: simulation/hardware, dry-run support, approval support, platform and protocol versions.
2. Authoring produces an immutable proposed skill/plan revision. No hardware motion tools are available during proposal generation.
3. Review shows a read-only step graph and parameters. Approval binds to the exact code hash, parameters, robot identity, scene revision, and expiry.
4. Runtime rejects execution without a matching approval, including direct requests from another tab. Changing the plan invalidates approval.
5. Remove the nonfunctional dry-run palette action until it has defined backend semantics.

**Done when:** no motion is accepted before approval; a modified or expired proposal is rejected; STOP preempts execution; hardware and browser simulation are distinctly labelled. Mock-only frontend button tests are insufficient.

### B04 — Make persistence and sync failures recoverable

**P1 · web + API · 2–4 days**

**Evidence:** `persist`/`persistTool` ignore non-2xx message writes; history fetch is limited to 200 rows without pagination. `sync` failures only reach the console. Browser skill sync now reports HTTP failure, but has no durable retry queue. `RobotKeysPanel.revoke` similarly ignores HTTP status and has no network-error feedback.

**Actions:** add pending/saved/failed write state; persist an account-scoped outbox with idempotency keys; retry bounded transient failures; implement cursor-based history pagination; expose skill sync state and retry; check key-revocation responses before claiming success. Capture the immutable skill revision/metadata when enqueueing, rather than making a racing `list_skills` request later.

**Done when:** simulated 401/429/500/offline conditions do not silently lose history; retry creates one row; more than 200 events can be recovered/exported; failed key revocation remains clearly unreconciled; no background retry changes account ownership.

### B05 — Bound worker work and restore the complete stopped scene

**P1 for simulation; P0 if reused for hardware · web + runtime · 3–5 days**

**Evidence:** synchronous `session.call_tool` blocks worker message processing. `host.ts` can cut visible playback, but worker STOP waits for Python. `seek` restores arm targets/qpos and zeros velocities, but does not restore object transforms or the full physics/evidence state. No request deadline bounds a hung worker. Boot cancellation now cleans up a completed late boot, but an indefinitely hung boot still needs a cancellation/deadline path.

**Reproduce:** run a deliberately long/infinite sandboxed computation in a disposable simulator; press STOP. Separately stop mid-carry, then compare the next reported object pose to what was displayed.

**Actions:** introduce request deadlines and a terminate/reboot recovery path; assess Pyodide interrupts with a SharedArrayBuffer on appropriately isolated app routes; retain full simulator snapshots including object state and evidence bookkeeping; prevent reset from clearing an in-flight abort. Use the runtime's supported snapshot API, not more UI writes into private `_write_qpos` methods.

**Done when:** hung work settles with an actionable error within a documented deadline; no next tool runs after STOP; stopped arm and objects match subsequent physics within defined tolerances; interrupted runs cannot retain success evidence from their unplayed future. Verify embedded Tally/Cal compatibility before adopting COOP/COEP globally.

### B06 — Make connection identity and liveness explicit

**P1 · web + runtime/API · 3–5 days**

**Evidence:** `normalizeHost` strips schemes and paths; `wsUrl`/`httpUrl` derive TLS solely from the page. HTTPS + a plain localhost runtime produces `wss://localhost`, despite the helper allowing the address. Private IPv6 and custom TLS/tunnel cases are incomplete. The relay control is disabled. Reconnect count resets after each hello, and no heartbeat detects a half-open established socket.

**Actions:** represent connection endpoints as validated structured URLs; preserve an explicit allowed scheme; support bracketed IPv6; reject credentials/query/fragment misuse; expose actual TLS/network errors; define heartbeat freshness and bounded backoff. Ensure late automatic robot discovery cannot override a manual connection choice. Design outbound authenticated relay and direct-runtime origin/authorization checks in their owning repositories.

**Done when:** table-driven tests cover HTTP/HTTPS pages, plain/TLS loopback, IPv4/IPv6 LAN, mDNS and public TLS endpoints; stale telemetry is labelled; a flapping/half-open socket cannot appear indefinitely healthy. Document a working hosted-app connection procedure rather than advising a dormant robot-served UI.

### B07 — Keep STOP available across the whole control-room shell

**P0 before hardware · web · 1–2 days**

**Evidence:** `AppShell` keeps the provider alive across `/app/device`, but `StopControl` is rendered inside `Workspace`. Navigating to device approval can preserve a runtime connection while removing the STOP control. The UI is not a physical emergency-stop circuit.

**Actions:** move runtime STOP/status into a layout-level shell; show confirmed/pending/unknown latch state; distinguish simulation from hardware; preserve access after WebSocket loss. Test keyboard, narrow viewports, dialogs and device routes. Keep operator-presence and physical-stop requirements in the runtime/hardware runbook.

**Done when:** every signed-in route with a live connection presents STOP; pending/failed requests never masquerade as confirmed stops; clearing stays an explicit separate action.

### B08 — Dispose 3D resources and handle scene replacement

**P2 · web · 2–3 days**

**Evidence:** `ArmModel` has no effect cleanup for Draco/model resources. `Workcell` adds meshes to an imperative map but never removes bodies absent from new state or updates changed size/material. Closing/reopening `SimPanel` repeatedly mounts a new scene. The displayed arm is hardcoded OpenArm even if a different platform reports state.

**Actions:** cancel late loading callbacks; dispose owned geometry/materials/textures and decoder workers; remove absent bodies; update changed dimensions; load a supported platform descriptor or display unsupported-platform state. Keep an accessible canvas-loading/error fallback. Fix the screenshot helper's misplaced `waitForFunction` timeout options when extending it.

**Done when:** repeated panel open/close does not accumulate workers/GPU objects; switching scenes removes old bodies; unsupported robots do not silently render as OpenArm; verify on a narrow/mobile viewport.

### B09 — Tighten external contracts and model attribution

**P1 · web + runtime/API · 2–4 days**

**Evidence:** `parseContract` only checks prompt truthiness and tools-array presence. Model responses and most account API responses use casts/`any`. `teach` emits the requested model name with provider `openai` before receiving a response, so the browser's “ran on” notice does not establish actual provider/model attribution. Model affordability is loaded once and can become stale after spending.

**Actions:** validate bounded iteration/follow-up limits and tool schemas from the wheel; validate model response envelopes and arguments against the supplied JSON Schema; return authoritative model/provider/usage from the inference API; bind those to run receipts; refresh affordability after balances change. Keep BYO-runtime models separate from account-credit affordability.

**Done when:** malformed contracts fail at boot; malformed model envelopes give an actionable error; full invalid arguments never reach primitives; reported model and billed usage agree for routing/fallback cases; a changed balance updates selection state.

### B10 — Align public claims with shipped behavior

**P1 · product owner + web · 1–2 days**

**Evidence:** `features.tsx`/`hero-card.tsx` promise robot-served UI and review-before-motion, show policy/VLA executors as if available, and imply a measured reliability uplift. `LocalVisual` labels 12–20 ms as BotCortex's control loop, while `host.ts` paces playback at 20 Hz (50 ms). `pricing.tsx` says inference is never resold while the app presents metered inference credits. Hosted authenticated UI reload is not an offline local-runtime guarantee. Some copy also contradicts waitlist-mode instructions.

**Actions:** build a current/planned/experimental capability table with the product owner; qualify concept illustrations; cite research as research; remove unmeasured BotCortex latency/uplift claims; clarify credit pricing versus subscription plans and local execution versus hosted UI access. Add appropriate noindex metadata to diagnostic preview pages.

**Done when:** every public performance or availability claim maps to shipped behavior and a reproducible test/source. “Up to 35%” is attributed to RoboInspector's evaluated setting, not advertised as a measured BotCortex result.

### B11 — Make verification repeatable in CI

**P2 · web + runtime · 1–2 days**

**Evidence:** no tracked CI workflow; tests were initially 24 cases in 3 files and did not exercise lifecycle, provider races or browser boot. Worker assets are rebuilt only at dev start/build, so edits to `worker.ts` can appear ineffective during hot reload. The checked-in wheel has a fixed filename without a human-readable provenance manifest.

**Actions:** add CI with pinned Bun, frozen lockfile install, unit tests, typecheck and production build; run fixture browser smoke on an environment with Chrome; add a worker watch/rebuild workflow; store runtime commit, wheel SHA-256, platform and contract versions alongside each wheel release. Review tests in the runtime repo before upgrading the artifact.

**Done when:** a clean checkout runs the same checks; changed worker code reaches the browser; a wheel/contract mismatch fails explicitly; a broken simulator lifecycle is caught before merge. Establish bundle/boot baselines before deleting apparently unused dependencies.

## 7. Research and differentiation roadmap

### What existing work establishes

| Source | Verified observation | Product implication |
|---|---|---|
| Code as Policies [R1] | Language models generate executable robot programs using perception/control APIs | “Type a task, get robot code” is prior art |
| Voyager [R2] | Executable skill library, feedback, execution errors and self-verification in Minecraft | A growing code library and reflection loop alone are not unique; game results are not physical-robot evidence |
| RoboInspector [R3] | Studies 216 task/instruction/model combinations; reports failure-policy feedback improvements up to 35% in its evaluated settings | Capture structured failure context and benchmark repair; do not borrow its uplift as ours |
| ASPIRE [R4] | Closed-loop execution traces, failure diagnosis/repair, validation, persistent skills and evolutionary exploration | Generic “robots learn from failure” overlaps current robotics research |
| CaP-X [R5] | Benchmarks coding agents across abstraction/grounding levels; structured feedback and additional computation affect robustness | Evaluate the execution tools and feedback, not only which LLM is chosen |
| Waddle [R6] | Vendor describes code-as-policy agents, VLA tools, intermediate verification, shared skills, multi-agent coordination and overnight ACT training | VLA routing, skill reuse and overnight training are not sufficient differentiation; vendor claims are not independently benchmarked here |
| Intrinsic Flowstate [R8] | Digital-twin workcells, skills, behavior trees/failure recoveries, simulation validation and hardware transfer | A canvas and simulator alone are established product features |

### N1 — Evidence-backed skill revisions

**Best next product investment · web/runtime/API · 5–8 days after B01**

Extend the shipped task-evidence export into a runtime-issued receipt:

```text
run ID + event sequence
skill revision/hash + parameter hash
runtime/wheel/platform versions + robot identity
scene/calibration fingerprint + execution mode
approval reference (when applicable)
objective observations + verifier version + verdict/reason
trace reference + parent failed run/repair revision
authoritative model/provider/usage for authoring
```

**First implementation:** runtime emits an explicit final outcome and persists it; frontend displays “verified in simulation”, “failed”, “interrupted”, or “unknown” from that record. Preserve uncertainty on event gaps. Keep observer records separate from signed/attested records.

**Acceptance:** modifying skill code invalidates previous approval/evidence association; old tasks retain their original robot/model identity; results remain inspectable/exportable without a live model; no inference from chat text determines success.

**Measure:** fraction of runs with complete provenance; missing-event rate; time to diagnose a failed run. Target complete provenance for every run in the benchmark, rather than an arbitrary success badge.

### N2 — Reproducible failure capsules and repair comparison

**Candidate differentiator · runtime + web · 5–10 days after B02/B05/N1**

A capsule packages a failed run's code, arguments, initial simulator state, relevant recalled episodes, versions and verifier. A “Compare repair” action runs candidate versions against the same fixture plus controlled perturbations. It shows what changed and where the repair helps or regresses.

**First implementation:** support one OpenArm scene and one objective task predicate, such as a named block remaining in a named tray for a fixed settling interval. Create full-state snapshots in the runtime. Replay is deterministic within documented numeric tolerances and version constraints, not presumed bit-identical across hardware/WASM engines.

**Acceptance:** replay reconstructs the same failure class; an interrupted carry restores object state; a repair must pass its original case and a held-out case; a model's “done” text cannot satisfy the predicate.

**Measure:** diagnosis time, repeat-failure rate, repair regression rate, and false-success rate.

### N3 — Context-aware failure memory with measured lift

**Research experiment · runtime first · 4–7 days after durable storage**

Store retrieval keys for task, skill revision, platform, scene/object configuration, failure class and verifier. Retrieve only relevant compatible episodes. A lesson is a hypothesis backed by observations; expire or supersede it when the skill/platform changes. Rank deterministic matches before adding embeddings.

**Experiment:** compare (A) no recall, (B) keyword recall, and (C) structured context-filtered recall on the same tasks, model/version, budgets and seeded initial states. Freeze the memory used for held-out evaluation and prevent test-case leakage.

**Acceptance:** all retrieval decisions can be inspected; stale/incompatible lessons do not silently enter the prompt; every run has an objective outcome and a recorded cost. Report negative results as well as gains.

**Measure:** held-out task success, second-attempt recovery, repeated failure class, token cost and wall-clock time. Report sample sizes and uncertainty; do not reuse published percentage improvements as forecasts.

### N4 — Verified reuse before re-authoring

**Product efficiency · runtime + web · 3–5 days after N1**

Match owner intent to an existing skill with compatible parameters, platform and evidence. Present why it matches and which assumptions were checked; execute the approved deterministic artifact locally. Escalate to authoring when prerequisites fail. A string match is not authorization to move hardware.

**Acceptance:** compatible known tasks execute with zero model requests; changed context invalidates reuse; trace shows reuse versus repair versus new authoring; hardware approval still applies.

**Measure:** reuse hit rate, time to first action, authoring spend saved, and context-mismatch rejection rate.

### Benchmark design for juniors

1. Start with 3–5 physically feasible simulation tasks and explicit predicates.
2. Store task fixtures, full initial states, seeds, perturbations, limits and verifier versions in the runtime repository.
3. Separate authoring performance from already-taught execution performance.
4. Run paired baseline/candidate trials on identical fixtures. Record all failures and stop events.
5. Use held-out object positions/parameters, equal model budgets, and a fixed evaluation memory snapshot.
6. Publish trial count, success definition, false-success count, recovery rate, latency distribution, and cost per verified result. Add confidence intervals when enough independent trials exist.
7. Gate release on no new false-success/STOP regressions and a demonstrated improvement on the agreed metric.

**Novelty claim discipline:** these are differentiated product directions to validate, not patent novelty findings or proof competitors lack them. The durable advantage would be owner-specific evidence, reproducible regressions and reliable deployment behavior accumulated over time.

## 8. Verification and local development

### Results from this pass

| Check | Result |
|---|---|
| Baseline `bun test` | 24 passed, 0 failed, 3 test files |
| First pass `bun test` | 64 passed, 0 failed, 7 test files |
| Second pass `bun test` | 123 passed, 0 failed, 11 test files |
| TypeScript | `bun run typecheck` passed; the final production build's TypeScript check also passed |
| Production | Final `bun run build` passed, including static generation and dynamic task route |
| Public pages | `/`, `/signin`, `/signup`, `/demo`, `/simview-preview` returned 200; signed-out `/app` redirected to sign-in |
| Chrome fixture smoke | Public navigation, delayed history isolation, evidence download, delete navigation, STOP error feedback, REST STOP after socket loss, real WASM boot, sim STOP/reset, durable account memory (IndexedDB store per account), STOP on `/app/device`, reconnect hydration passed |
| Browser errors | No `pageerror` events during the successful fixture smoke |
| Simulator boot | About 1.9 seconds in that local test; one local observation, not a cold-download benchmark |
| Real account API | Unavailable at baseline; fixture does not validate production API behavior |
| Real robot / paid model | Not exercised |

The existing vendor-error test intentionally logs a simulated HTTP 402 while asserting the friendly error message. That console output is not a failing test or a real charge.

### Daily commands

```bash
bun install --frozen-lockfile
bun dev
```

In another terminal:

```bash
bun test
bun run typecheck
bun run build
```

For actual account integration, start `botcortex-api` according to that repository's instructions and provision a development account. This web repo defaults to `API_URL=http://localhost:8787`. `/signup` is a Tally waitlist, not account creation. Never place provider or robot credentials in `NEXT_PUBLIC_` variables.

For isolated frontend integration, keep port 8787 free and the dev server on 3000 with the default local API URL:

```bash
bun scripts/audit-smoke.ts
```

That script starts a loopback-only in-memory fixture, creates a new Chrome context with a test cookie, and stops its fixture/browser on exit. It never contacts a robot or an inference provider. It will fail to bind if another service owns the port. It requires Chrome, not a logged-in user browser.

If changing worker code during dev:

```bash
bun run worker:watch   # rebuilds public/sim-worker.js on every save
```

Then disconnect/reconnect the in-browser simulator. The worker is built separately from Next hot reload; `bun run vendor` does a one-off rebuild. The committed wheel is described by `public/botcortex/MANIFEST.json`, and `bun test` fails if the two disagree.

## 9. Suggested delivery sequence

| Phase | Tickets | Deliverable |
|---|---|---|
| First | B01, B04 | Correct run ownership, durable writes, visible failure state |
| Second | B02, B05 | Memory survives reload; stopped/failed execution has coherent state |
| Hardware prerequisite | B03, B06, B07 | Runtime-enforced approval, compatible authenticated transport and layout-level STOP |
| Evidence release | N1, B09 | Versioned runtime outcomes with trustworthy provenance |
| Differentiation experiment | N2, N3 | Reproducible failure/repair comparison and measured memory lift |
| Efficiency | N4 | Evidence-aware skill reuse with no model calls for known compatible tasks |
| Alongside each phase | B08, B10, B11 | Performance hygiene, accurate claims and automated checks |

### Review checklist for each ticket

- [ ] Reproduced the original behavior or documented the precise missing capability.
- [ ] Put enforcement in the owning runtime/API when browser state cannot guarantee it.
- [ ] Preserved the single runtime contract and added protocol versioning where needed.
- [ ] Covered failure, timeout, disconnect, duplicate and stale-response paths relevant to the change.
- [ ] Verified that the UI says pending/unknown when evidence is absent.
- [ ] Ran the relevant unit, browser and build checks.
- [ ] Updated this guide's ticket status with evidence, not just intent.

## 10. Engineering rules

1. Keep language models out of the real-time control loop.
2. Keep runtime limits, execution approval, STOP and verification authoritative in the runtime.
3. Treat task completion, successful tool invocation, skill saved, and skill synced as different facts.
4. Build lifecycle/ownership boundaries before splitting a large file into cosmetic modules.
5. Do not duplicate the Python prompt, primitive arithmetic or verifier in TypeScript.
6. Derive novelty claims from demonstrated behavior and experiments. Prefer an honest unknown over a reassuring but unsupported success.
7. Follow the installed Next guides and repository instructions. A successful browser demo does not establish hardware readiness.

## 11. Research sources

Accessed 2026-09-11. Primary papers/project pages and official product/docs were used; vendor descriptions are attributed claims. Local raw captures are in ignored `.firecrawl/`; these URLs and conclusions are the durable handoff.

- **[R1] Code as Policies: Language Model Programs for Embodied Control** — [project and demonstrations](https://code-as-policies.github.io/), [paper](https://arxiv.org/abs/2209.07753).
- **[R2] Voyager: An Open-Ended Embodied Agent with Large Language Models** — [project](https://voyager.minedojo.org/), [paper](https://arxiv.org/abs/2305.16291).
- **[R3] RoboInspector: Unveiling the Unreliability of Policy Code for LLM-enabled Robotic Manipulation** — [abstract, revised July 2026](https://arxiv.org/abs/2508.21378), [v2 full text](https://arxiv.org/html/2508.21378v2). The reported improvement is “up to 35%” in the paper's setting; this guide does not interpret it as a universal percentage-point gain.
- **[R4] ASPIRE: Agentic /Skills Discovery for Robotics** — [paper](https://arxiv.org/abs/2607.00272).
- **[R5] CaP-X: A Framework for Benchmarking and Improving Coding Agents for Robot Manipulation** — [paper](https://arxiv.org/abs/2603.22435).
- **[R6] Waddle: Introducing Waddle — agents that control robots** — [vendor research post](https://www.waddlelabs.ai/research/introducing-waddle).
- **[R7] Pyodide: Dealing with the file system** — [official documentation](https://pyodide.org/en/stable/usage/file-system.html). Consult the installed 314.0.3 API/version when implementing persistence; stable docs can advance.
- **[R8] Intrinsic Flowstate** — [official product description](https://www.intrinsic.ai/flowstate).
- **[R9] Next.js installed guidance** — `node_modules/next/dist/docs/01-app/02-guides/authentication.md`, `01-app/01-getting-started/05-server-and-client-components.md`, and `01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`. Auth guidance distinguishes route filtering from authorization close to data; an API audit remains necessary.
