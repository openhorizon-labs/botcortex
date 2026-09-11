# Blue-next-to-red failure: root cause and runtime fix

**Date:** 2026-09-11

**Reported task:** `/app/tasks/a686fdfc-fa0e-4c8b-a76e-dc5790508533` — “Move the blue block next to the red one.”

## What failed

The agent read the block positions and authored a pick-and-place skill. The first
whole-skill rehearsal reported that blue had been ejected; the second reported
that red had been ejected. Both were rejected before visible execution, leaving
the workcell unchanged. These were runtime rehearsal rejections, not a disconnected
viewer or missing model response.

The trace also showed weak planning: `can_reach` checked destination y = -0.12,
while the saved code targeted y = -0.22. The retry raised its transit to roughly
z = 0.47 without checking the revised waypoints. However, reproducing the actual
skills uncovered a deeper defect than the model's planning choices.

## Root cause 1: geometry queries changed the grasp

In both `botcortex/sim.py` and `botcortex/wasm.py`:

- `tip()` computed the end-effector position by calling a pose probe that wrote
  joint positions back into `qpos`.
- `solve_pose()` and `pose_tip()` restored state from `get_positions()`.
- `get_positions()` represents the gripper using **finger one's** position;
  restoring that gripper angle writes it onto **both fingers**.

A held object can put the fingers at different positions. Reading the tip or
asking an IK question could therefore teleport the other jaw into the object,
alter contacts, and change the later simulated outcome. Even adding diagnostic
tip reads changed whether the first captured skill succeeded.

**Fix:** `tip()` reads the existing MuJoCo body transform without writing anything.
Hypothetical pose queries use the full rehearsal snapshot/restore mechanism,
preserving independent fingers, velocities, control targets and integrator state.
Regression tests deliberately set asymmetric finger positions and require all
tracked physics state to remain identical after each geometry query.

## Root cause 2: transit validation ignored the other blocks

`kinematics.reach()` tested endpoint arrival and structural-link/fixture collisions.
It could accept a route that arrived accurately while sweeping red off the table.
The outer skill rehearsal caught the damage only after the complete program ran,
then gave the model generic “travel higher” advice.

**Fix:** `safety.ObjectMotionGuard` measures object effects during candidate routes:

1. Identify the currently carried payload from contact with both fingers.
2. Reject a route that displaces an unheld object by more than 15 mm.
3. Reject a route that loses an existing grasp during transit.
4. Try the existing alternate transit routes before returning a refusal.
5. Apply the same checks to selected execution, gravity-compensation trims and
   return-to-home routes.

Rehearsal still rolls back a refused attempt. The collision, STOP and velocity
bounds remain enforced. A failed candidate now names the affected object, and a
whole-skill rejection includes its exact `Failed step` waypoint or home phase.

The guard is a deterministic check inside the runtime. No model enters the
control loop, and the solver/guard logic is shared by native and browser physics.

## Better information for the authoring agent

- `can_reach` now says “N mm **position error**,” rather than “N mm to spare.”
  The old wording was not a measurement of obstacle clearance or workspace margin.
- The shared prompt requires checks against the coordinates the saved code really
  computes; changed offsets/heights invalidate previous checks.
- Placement should use object dimensions, support geometry and finger clearance.
- Repair the reported failing step instead of assuming a higher endpoint makes the
  swept path clear. Distinguish a model hypothesis from measured failure evidence.
- Verify object positions after lifting/release and check that neighbors stayed put.

The contract is regenerated in the runtime repository and shipped in the wheel;
there is no separate TypeScript copy of the planning rules.

## Verification

### Native MuJoCo

`tests/fixtures/move_blue_next_to_red.py` preserves the first captured skill.
`tests/test_scene_motion.py` verifies:

- Pure geometry queries with asymmetric fingers.
- Both captured skill versions through full `RobotSession.tool_run_skill()`.
- A transfer with the blue block's starting x shifted by 10 mm.
- Blue arriving beside red while red and green stay within 5 mm of their starts.
- A high endpoint whose original direct path ejected red now preserves it.
- Unintended movement is rejected, and reachability is described correctly.

Full runtime suite: **228 passed**. Ruff passes. The mock CLI wave smoke passes.
One pre-existing FastAPI/Starlette dependency deprecation warning remains.

### Browser WASM, real shipped wheel

```bash
# In botcortex, with bun dev running on localhost:3000:
bun scripts/sim-task-smoke.ts
```

This boots a fresh, session-only worker, saves the captured high-path skill, runs
it through the real Python session, and asserts the physical outcome. It uses no
account session, model call, cloud credit or hardware connection.

Measured result on runtime **0.0.2**:

| Object | Start, metres | End, metres |
|---|---|---|
| blue | `[0.32, -0.05, 0.222]` | `[0.2248, -0.2246, 0.22]` |
| red | `[0.22, -0.16, 0.222]` | `[0.22, -0.16, 0.22]` |
| green | `[0.22, 0.16, 0.222]` | `[0.22, 0.16, 0.22]` |

The 2 mm vertical change of red/green is initial settling onto the tabletop;
neither moved horizontally. Blue's final center is about 6.5 cm from red's.
The worker returned **604 motion frames** and a clean-rehearsal result.

The initial worker computation took about **59 seconds**, and the user measured
**70 seconds** on their machine, followed by about 30 seconds of paced playback.
`DEADLINES_MS.callTool` is now **600 seconds**, providing headroom for longer
skills and slower machines until path search is faster. Boot and STOP/reset
deadlines retain their separate bounds. `sim-task-smoke.ts` uses the same
per-request deadlines instead of its former 120-second whole-test timeout.
This establishes correctness for the reproduced
task, not acceptable final-product latency. Endpoint search is still a coarse
grid with nested physics rehearsals; improving it is a separate measurable task.

Initial web verification: **156 tests passed**, TypeScript passed, production build passed.

### Original signed-in task

After the isolated tests passed, the idle in-browser simulator was reconnected to
load 0.0.2 and rehydrate the existing saved skill. The skill was run once through
the normal sidebar Run action on the original task:

- Run request persisted at `2026-09-11T13:17:20.526Z`.
- Successful result persisted at `2026-09-11T13:19:00.181Z`.
- New reply: “Moved: blue_block moved 20 cm and is now on table, at
  [0.225, -0.225, 0.22].”
- Browser canvas confirmed blue beside red, green in its original position, and
  arms returned home. Activity returned to idle.
- Model credit remained $0.29. This was deterministic saved-skill execution, with
  no new authoring/model call.

The earlier two failed rehearsals remain in the transcript as historical evidence;
they are not the outcome of this new run. The tool-evidence totals describe those
loaded authoring calls, while the Run action adds its new result to the transcript.

## Artifacts and reproduction

- Runtime source: sibling `botcortex-runtime` repository, version `0.0.2`.
- Browser artifact: `public/botcortex/botcortex-0.0.2-py3-none-any.whl`.
- `public/botcortex/MANIFEST.json` pins its SHA-256 and contract version.
- Worker boot and contract/schema tests now select the wheel from that manifest.
- The prior wheel remains available for existing clients/rollback.
- Runtime source is committed as `1f921978fab2c34962dba4daf55cc7b7e4d00eef`,
  and the manifest pins that commit. All **37 package files** in the existing
  wheel were compared byte-for-byte with `git archive` of that commit. The
  wheel was not rebuilt; its SHA-256 is unchanged.

After changing the runtime, regenerate its contract, build its wheel, update the
manifest hash, run `bun run vendor`, and reconnect the browser simulator. An
already-running worker keeps its loaded Python package until it is restarted.

## Smoke-test startup checks

Both fixture-backed browser smokes require port 8787 to be free on **IPv4 and
IPv6**. They now test TCP connectivity on `127.0.0.1` and `::1` before creating
the fixture or starting Chrome. Binding a probe alone is insufficient on macOS,
where a specific-address listener can coexist with a wildcard listener.

Each fixture also returns a unique per-run identity header. Before launching the
browser, the script verifies that Next's `/api/me` rewrite reaches that exact
fixture. A wrong `API_URL`, a stale rewrite or an unexpected listener fails with
an actionable error. Waiting for fixture history requests is also bounded.

Run the smokes **sequentially**, with `botcortex-api` stopped, then restart it:

```bash
bun scripts/audit-smoke.ts
bun scripts/review-smoke.ts
```

The audit smoke asserts and reports the version returned by the real worker,
including its skill/episode persistence check. The review smoke exercises account
and run-routing behavior through its mock runtime. Port-occupancy regressions
cover both loopback families and IPv4/IPv6 wildcard listeners; the real running
API also caused each script to refuse startup in about 140 ms.

The unused `NEXT_PUBLIC_API_URL` entry was removed from local `.env.local`.
The web rewrite uses server-side `API_URL` (default `http://localhost:8787`).

Follow-up validation after deadline/fixture hardening:

- Runtime: `make test` — **228 passed**, then the mock wave smoke passed.
- Web: `bun test` — **164 passed**; TypeScript and production build passed.
- `audit-smoke.ts` — **11 checks passed**, explicitly reporting runtime **0.0.2**.
- `review-smoke.ts` — **9 checks passed**, no browser page errors.
- `sim-task-smoke.ts` — the physical transfer passed again using the shared
  per-request deadlines; **604 frames**, approximately **63 seconds** compute.
- The API was stopped for the fixture-backed smokes, restarted afterwards, and
  `/health` returned success. The web dev server remained available on port 3000.

## Scope of the result

The captured task and the tested variants now execute successfully while preserving
neighboring objects. Unreachable targets, blocked routes and lost grasps must still
be refused honestly. These checks do not prove that every natural-language request
is feasible, that all perturbations succeed, or that simulation success establishes
hardware safety. Next priorities are faster path search, streamed rehearsal progress,
and broader objective manipulation benchmarks.
