# Review of Claude Code's implementation pass

**Reviewed:** 2026-09-11

**Commit:** `4602acf` — Implement the audit: run-bound history, durable browser memory, honest STOP

**Input:** `docs/CHANGES_FOR_REVIEW.md`

**Verdict:** **Request changes.** The implementation improves the baseline, but the new ownership, persistence and lifecycle paths still contain correctness bugs.

**Follow-up:** R1–R9 have now been fixed and verified; see [Resolution](#resolution--2026-09-11). The findings and source references below preserve the original review of `4602acf`.

The commit also includes the preceding F01–F18 changes. This review focuses on Claude's subsequent B-ticket implementation. Source line references below are for the reviewed commit. Application code was not changed during review.

## Findings

### R1 — P1: a live simulator can sync one account's skills into another account

**Locations:** `lib/robot/browser-sim/transport.ts:171–177`, `55–68`, `297–303`; `components/app/app-shell.tsx:20–27`.

The account namespace is resolved once at boot. The transport retains that account's files and its `saved` map, but subsequent inference and skill-sync requests use whichever session cookie the browser has now. The provider is not reset when session identity changes.

**Trigger:** keep tab 1 open with account A's simulator, then sign out/sign in as B in another tab sharing the same origin. Tab 1 still holds A's simulator and cached skills. Retrying a failed skill sync posts A's code with B's current credentials. Normal same-tab sign-out performs a full navigation; the cross-tab/session-change case is the gap.

**Reproduction:** an isolated transport harness booted with namespace A, saved a fixture skill while sync returned 503, changed the mocked authenticated identity to B, then sent `sync_skill`. The second POST contained A's original skill code under B's authenticated session. No real accounts or provider credentials were used.

**Fix:** bind the transport and pending work to an account identity/session generation. On sign-out or identity change, abort authoring, close the worker, release its lease, and discard/quarantine the old account's retry state. Revalidate ownership before retrying. Coordinate this with server-side ownership checks; a browser namespace alone is not an authorization boundary.

**Regression test:** two tabs share a browser context; A boots and saves, B replaces the session; A's old tab cannot read/run/sync its old account state using B's session. Also test session expiry and a session transition during an in-flight retry.

### R2 — P1: an explicitly unknown run ID falls back to the current run

**Location:** `components/app/robot-provider.tsx:504–511`.

`runFor(runId)` looks up the supplied ID, but if it is unknown it returns `activeRunRef.current`. The compatibility fallback should apply only when an event has **no** run ID. An explicitly different run is not evidence that it belongs to the latest local task.

**Trigger:** a runtime broadcasts an event from another client, delivers an event whose binding was evicted, or changes connection while old bindings remain. The event can be stored in an unrelated task. `teardown()` also leaves the run-binding map and active binding intact across robot switches.

**Reproduction:** a Chrome fixture started run A, then delivered a `chat` event with `runId: "unrecognized-external-run"`. The app POSTed that event with `conversationId: "a"`.

**Fix:** distinguish missing from unknown IDs. Hold/reject explicitly unbound events, scope run bindings to the connection/runtime identity, and retire bindings appropriately. Do not simply return `null`: `appendTo` currently treats `null` as permission to use/create the selected conversation. Use an explicit unbound-event path. Key in-flight tool calls by run plus call ID when correlation is available.

**Regression test:** an unknown named run must never persist into the active task; events without IDs remain compatible with the legacy single-run path. Include robot switches and overlapping tool-call IDs.

### R3 — P1: off-screen narration cancels the selected task's history load

**Locations:** `components/app/robot-provider.tsx:521–534`, `577–598`.

`appendTo` increments the global `historyVersionRef` before checking `onScreen(run)`. This was appropriate when all messages belonged to the displayed task. With the new run binding, an off-screen message now invalidates a different task's history request even though it adds nothing to that task's screen.

**Trigger:** start a long run in A, switch to B, and receive A's narration while B's history request is pending. B's response is discarded and the cleared pane remains empty. This also means a follow-up entered in B can omit B's existing conversation context.

**Reproduction:** the Chrome fixture delayed B's history response, delivered an A-bound chat event, and then completed B's response. Results:

```text
URL: /app/tasks/b
B's saved history visible: false
A's background event persisted to: a
Browser page errors: none
```

**Fix:** invalidate a displayed-history load only when the visible transcript changes, or track history generations independently per conversation. Keep off-screen persistence independent of visible-history loading.

**Regression test:** B finishes loading while A streams chat/tool events; A's events remain absent from B and are still saved to A. Include A→B→A with delayed writes.

### R4 — P1: cancelling startup before account/lease resolution leaks the memory lock

**Locations:** `lib/robot/browser-sim/transport.ts:147–159`, `170–190`, `236–245`.

`close()` releases only a lease already assigned to `releaseLease`. `open()` can subsequently finish `accountNamespace()` or `locks.request()`, acquire a new lease, and even boot a worker despite `closed` already being true. The late `this.closed` branch closes the worker but does not release that newly acquired lease.

**Trigger:** navigate away or switch connections while account lookup/lock acquisition is pending. Subsequent simulator starts on that origin can become session-only because the cancelled transport still holds the global memory lock.

**Reproduction:** delayed `/api/me`, called `close()`, then resolved account A and granted the lease. Observed:

```text
open result: Simulator closed while starting.
workers booted after close: 1
late worker closed: 1
memory lease still held: true
```

**Fix:** check cancellation after each awaited startup stage; release a lease granted after cancellation immediately. Centralize failed/cancelled startup cleanup so it runs for both a late completion and a rejected boot. Do not release an active writer's lease before its worker is no longer able to write.

**Regression test:** cancel separately during account lookup, lock acquisition and worker boot; each path leaves no worker and no held lease. The next tab/transport must acquire durable memory normally.

### R5 — P1: conversation-creation failures bypass the new outbox and lose the entire run

**Locations:** `components/app/robot-provider.tsx:332–343`, `355–362`, `482–489`.

Every run captures one conversation promise. If the opening `POST /api/conversations` fails, that promise stays rejected for the run's lifetime. Both persistence paths catch it and return before submitting anything to the outbox. The new pending/failed indicator therefore reports no problem, and retry has no work to recover—even after the API becomes healthy.

**Reproduction:** forced conversation creation to return 503, sent a new task, then delivered its runtime reply. The prompt stayed visible, but there were zero new message POSTs, zero unsaved warnings and no retry button. The robot still received the task.

**Fix:** make conversation creation a recoverable, visible persistence operation. Hold the run's immutable messages/tool results until its original conversation is created, then drain them under that binding. Retrying must preserve the original task and not depend on the currently selected task. At minimum, surface the creation failure rather than silently dropping the run's record.

**Regression test:** first creation fails, a later retry succeeds, and the opening prompt plus all subsequent run events are filed once under the correct task. Selection changes must not change their owner.

### R6 — P2: outbox retries are attempt-bounded but requests can hang indefinitely

**Location:** `lib/robot/outbox.ts:131–137`.

The new outbox has bounded attempt counts and backoff, but its fetch has no deadline or cancellation signal. If the API accepts a request and never answers, `drive` never reaches its retry/failure logic. The UI stays “saving…” and the item cannot be retried because it remains in flight. Provider teardown also has no mechanism to cancel this work.

**Reproduction:** a stub fetch that does not settle leaves `pending: 1`, `failed: 0` even with `maxAttempts: 1`; the request has no abort signal. This is a hung-request path, not an ordinary HTTP 503 retry.

**Fix:** add per-attempt deadlines and abort handling, plus explicit outbox disposal on provider/account teardown. Timeouts should enter the retry policy and eventually produce an actionable failure state. Respect server retry timing where available.

**Regression test:** an abort-aware never-answering fetch times out, retries only within the defined budget, and ultimately becomes failed; disposing the outbox stops timers and further network requests.

### R7 — P2: a healthy idle runtime is permanently labelled stale

**Locations:** `components/app/robot-provider.tsx:58–60`, `898–924`.

The heartbeat runs every 5 seconds, while stale means 3 seconds of silence. An idle backend that responds to ping but does not stream state is therefore stale on every heartbeat tick. Its pong updates `lastHeardRef`, but receiving that pong never clears `telemetryStale`; the next tick again occurs about 5 seconds later.

**Reproduction:** a Chrome fixture returned pong for every ping. After two successful pongs, the “telemetry stale” chip remained visible.

**Fix:** separate transport liveness from telemetry freshness. Clear transport-stale state when a valid response arrives, choose thresholds consistent with the ping cadence, and track state freshness separately for streaming backends. Invalid frames should not refresh health before validation.

**Regression test:** an idle ping-responsive backend stays healthy; a nonresponsive backend becomes stale then reconnects; recovery clears the warning promptly; a socket that responds to ping but stops required telemetry is identified separately.

### R8 — P2: endpoint parsing silently changes an explicitly requested TLS port

**Locations:** `lib/robot/protocol.ts:242–258`.

Every authority is parsed through `new URL("http://...")`, before the actual scheme is applied. The URL parser removes port 80 as HTTP's default. If the owner supplied `wss://robot.example:80`, the stored host becomes `robot.example`; the app then dials WSS/HTTPS on port 443 instead. Both the robot connection and STOP request go to the wrong service.

**Reproduction:**

```text
input: wss://robot.example:80
actual WebSocket URL: wss://robot.example/ws
actual STOP origin: https://robot.example
```

**Fix:** parse using the effective scheme or preserve the explicitly supplied port independently of parser default-port normalization.

**Regression test:** explicit 80 and 443 must retain their intended meaning across ws/wss/http/https, including IPv6 literals and remembered endpoint reloads.

### R9 — P2: the schema checker skips a union already present in the shipped wheel

**Location:** `lib/robot/agent/schema.ts:39–47`; integration at `lib/robot/agent/loop.ts:287–293`.

The small validator is presented as covering the wheel's current schemas, but the wheel already defines `move_to.duration` using `anyOf: [{type: "number"}, {type: "null"}]`. The checker ignores `anyOf`, so an object/string in `duration` passes validation and reaches dispatch. This is a gap in an existing exported parameter, not a request to implement every possible JSON Schema feature.

**Reproduction:** loaded `move_to`'s schema directly from the committed wheel and validated:

```json
{"arm":"right","targets_json":"{}","duration":{"bad":"value"}}
```

The validator returned `null` (accepted).

**Fix:** support the schema constructs actually exported by the wheel, especially nullable unions, and test against real contract entries. Make unsupported constructs explicit if they remain delegated to the runtime. Preserve valid `number` and `null` inputs.

**Regression test:** the shipped `move_to` accepts numeric/null duration, rejects object/string duration before dispatch, and the next wheel upgrade cannot silently expand the unsupported schema subset.

## Verification record

| Check | Review result |
|---|---|
| `bun test` | 123 passed, 0 failed, 11 files |
| `bun run typecheck` | Passed |
| `bun run build` | Passed, including TypeScript and route generation |
| `bun scripts/audit-smoke.ts` | First attempt timed out opening the Connect menu after navigation; a repeat without source changes passed all 11 checks. Treat the smoke as having an observed synchronization flake. |
| Additional Chrome run/history fixture | Reproduced R2, R3, R5 and R7 with zero page errors |
| Delayed account/lease harness | Reproduced R4 |
| Account-switch transport harness | Reproduced R1 with fixture identities and fixture skill code |
| Endpoint/schema/outbox probes | Reproduced R8, R9 and R6's missing-deadline path |
| Real Pyodide/IDBFS round trip | Saved a fixture skill and failed episode, terminated/rebooted the worker, recovered both. A separately booted namespace B saw no A skills. |
| Real API, paid model, hardware | Not exercised |

The real memory round trip confirms that basic same-account persistence works. It does not eliminate the live-session ownership bug in R1 or the cancelled-startup lease leak in R4.

## Test gaps and handoff corrections

1. Add actual run-originating browser tests. The current stale-history smoke switches between stored conversations but never starts a run before switching, so it cannot validate the headline B01 behavior.
2. Change the memory smoke from checking database existence to saving/restoring a real skill and episode. Include account switching and concurrent/cancelled startup, not just empty-store reconnection.
3. Add tests for the pre-outbox conversation-creation failure, not only message POST failures.
4. Add idle heartbeat recovery and real wheel schema tests.
5. In `CHANGES_FOR_REVIEW.md`, distinguish implemented web pieces from fully verified B-ticket completion. B01, B02, B04, B06 and B09 need the fixes above. B03's eventual plan review UI will still require web work once the runtime contract exists.

## Recommended fix order

1. **R1 and R4:** account ownership and lock lifetime.
2. **R2, R3 and R5:** run routing and durable task records.
3. **R6–R9:** bounded network behavior, liveness and input/endpoint correctness.
4. Run the new failure-path regressions, existing tests, Chrome smoke and build before updating the review status.

The shared contract, layout-level STOP, explicit failure states, provenance manifest and more accurate product copy are worthwhile improvements. At review time, approval was blocked by the reproduced ownership/data-loss issues, not by the overall direction.

## Resolution — 2026-09-11

All nine findings were addressed in the follow-up implementation:

| Finding | Implemented correction | Regression coverage |
|---|---|---|
| R1 | `AppShell` keys the workspace by authenticated account. Account-scoped fetches check identity before retries/model calls. The originating account also rides in a request header; `proxy.ts` validates it against that request's cookie before forwarding, closing the lookup/write race. Account changes abort the old worker, drafts and outbox. | Account/transport/proxy tests; cross-tab reset and rejected wrong-account write in Chrome |
| R2 | Explicitly unknown runs are ignored, rather than interpreted as legacy events. Connection teardown retires bindings. Live calls and saved trace keys include run identity. | Chrome sends unknown chat/tool/results and verifies none are persisted |
| R3 | Off-screen events persist without invalidating the displayed conversation's history generation. | Chrome loads B while a live run in A produces another message |
| R4 | Startup checks cancellation after lookup and lease acquisition; host boot observes the cancellation signal. Failed/late startup closes its worker and releases the account-scoped lease. | Cancellation during lookup, lease acquisition and boot; failed-boot cleanup tests |
| R5 | A recoverable `ConversationDraft` retains one unresolved binding and its waiting writers across creation failures. Failures are visible and retryable; successful retry files original messages/tool results regardless of selected task. | Draft unit tests and Chrome failure/retry after switching tasks |
| R6 | Outbox attempts have a 10-second deadline, abortable backoff and provider-lifetime disposal. Retry bodies are immutable. | Hung request, retry budget, disposal and immutable-body tests |
| R7 | `ConnectionHealth` separates valid-message liveness from freshness of observed streaming state; pong replies clear liveness promptly. | Idle, silent, recovered and stalled-telemetry tests; idle Chrome runtime |
| R8 | Authority parsing uses the effective scheme, so port normalization cannot change the intended TLS port. | Explicit 80/443 cases for all four schemes and IPv6 |
| R9 | Argument validation handles the wheel's `anyOf` nullable unions and checks additional-property schemas. | Tests load `move_to` from the actual committed wheel and reject invalid duration shapes |

The recovery smoke also exposed a stale route-prop issue after New task → reopening the same task. `Workspace` now follows `usePathname`, including Next's native-history integration, while preserving the no-remount behavior when a fresh task receives its URL.

### Final checks

```bash
bun test                         # 156 passed, 0 failed, 14 files
bun run typecheck                # passed
bun run build                    # passed
bun scripts/audit-smoke.ts        # 11 checks passed, pageErrors: []
bun scripts/review-smoke.ts       # 9 checks passed, pageErrors: []
```

The audit smoke now writes a real fixture skill and failed episode through the running worker, waits for successful flush, reconnects, and verifies that both are recovered. The review smoke exercises live run routing, not only stored-history navigation. Fixtures use loopback and isolated browser contexts; real API authorization, paid inference and physical robot behavior still require their owning repositories' integration checks.

The broader architecture roadmap remains open where runtime/API contracts are needed: approval-before-motion, complete runtime snapshots, registry hydration, cursor pagination and durable transcript outbox storage. Resolving these nine review findings does not mark those larger features complete.
