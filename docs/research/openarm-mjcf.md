# Research: inside openarm_mjcf — actuators, joints, meshes, URDF, license

Resolves [wayfinder ticket #4](https://github.com/openhorizon-labs/botcortex/issues/4).
All facts verified against primary sources on 2026-08-02:
`enactic/openarm_mujoco` @ `ebc5cd29a957` (master), `enactic/openarm_description` @ `6c7b720f1ba4` (main),
and <https://docs.openarm.dev/simulation/mujoco/>.

**Repo identity first:** `reazon-research/openarm_mjcf` no longer exists under that name —
the GitHub API redirects it to **`enactic/openarm_mujoco`** (renamed + transferred; OpenArm
is Enactic, Inc.'s project, spun out of Reazon). Default branch is `master`. The repo holds
three model generations — `v0.3/`, `v1/`, `v2/` — plus a pip package (`pip install
openarm-mujoco`, launches the v2 scene). The only OpenArm repo left in the reazon-research
org is `openarm_robosuite_models`; everything else lives in the `enactic` org.

## 1. Actuators in v1

### v1/openarm_bimanual.xml — 18 actuators

Arm joints are **plain `<motor>` (direct torque) actuators** — no position or velocity
actuators on any arm joint. Names follow `{left,right}_joint{1..7}_ctrl`, force limits come
from per-motor default classes matching the real Damiao motors:

| Class | Joints | forcerange (N·m) |
|---|---|---|
| `motor_DM8009` | j1, j2 | ±40 |
| `motor_DM4340` | j3, j4 | ±27 |
| `motor_DM4310` | j5, j6, j7 | ±7 |

**Grippers are NOT tendon-actuated.** Two fixed tendons exist (`split_left`, `split_right`,
coef 0.5 per finger joint) but nothing references them — no tendon actuator, no tendon
sensor; they appear vestigial. The actual gripper mechanism is: two prismatic (slide) finger
joints per hand, coupled by an **`<equality><joint joint1=… joint2=…>` constraint** so they
mirror, each finger joint driven by its own actuator.

Quirk worth knowing: the shipped model is **asymmetric between hands** —
`right_finger1_ctrl` / `right_finger2_ctrl` are `<position>` servos (class `motor_finger`:
kp=100, ctrlrange `0 0.044`, forcerange ±333) while `left_finger1_ctrl` /
`left_finger2_ctrl` are `<motor>` (torque) actuators on the same class. Looks like an
upstream oversight; if we consume this file we should normalize (make both sides
`<position>`).

Sensors: only world-frame sensors on `world_site` (framepos/quat/linvel/angvel +
velocimeter). No joint torque/force sensors defined.

### v1/openarm.xml (single arm) — 8 actuators

All `<motor>` (torque): `joint1_ctrl`..`joint7_ctrl` (class `motor`, ctrlrange ±10;
`joint2_ctrl` overridden to ±12) plus one `finger_ctrl` on `openarm_finger_joint1`
(ctrlrange −0.1..0.1); the second finger follows via the same equality-joint coupling.
`v1/scene.xml` just wraps `openarm.xml` with a floor/light.

## 2. Joint names and ranges vs BotCortex config

`<compiler angle="radian">` — all MJCF ranges are radians. Bimanual joint names are
`openarm_{left,right}_joint{1..7}` + `openarm_{side}_finger_joint{1,2}`.

Right arm (v1 bimanual), with degree conversion:

| MJCF joint | range (rad) | range (deg) | BotCortex/vendor limit (deg) |
|---|---|---|---|
| `openarm_right_joint1` | −1.396263 .. 3.490659 | −80 .. 200 | j1 ±75 |
| `openarm_right_joint2` | −0.174533 .. 3.316125 | −10 .. 190 | j2 −9 .. 90 |
| `openarm_right_joint3` | ±1.570796 | ±90 | j3 ±85 |
| `openarm_right_joint4` | 0 .. 2.443461 | 0 .. 140 | j4 0 .. 135 |
| `openarm_right_joint5` | ±1.570796 | ±90 | j5 ±85 |
| `openarm_right_joint6` | ±0.785398 | ±45 | j6 ±40 |
| `openarm_right_joint7` | ±1.570796 | ±90 | j7 ±80 |
| `openarm_right_finger_joint{1,2}` | slide 0 .. 0.044 (meters) | — | gripper −65 .. 0 (rotary deg) |

Left arm mirrors j1 (−200..80°) and j2 (−190..10°) by sign, j3–j7 ranges identical (j7 axis
flipped `0 -1 0`) — same convention as our config's sign-mirrored left j2. The single-arm
file differs on j2 only: ±1.74533 rad (±100°).

**Mapping/mismatch summary:**

- Name mapping is mechanical: BotCortex `jN` ↔ `openarm_{side}_jointN`, `sim_rad =
  deg2rad(real_deg)`, sign +1, offset 0 (zero = arms hanging, matches the model's ref=0).
- **MJCF limits are wider than the vendor/hardware limits at every joint** (j1 −80..200 sim
  vs ±75 real, j2 −10..190 vs −9..90, j4 140 vs 135, j6 45 vs 40, j7 90 vs 80…). The sim
  will happily go where the real arm cannot — our config's degree limits must stay the
  source of truth for clamping; never trust the MJCF range as a safety envelope.
- **Gripper is a structural mismatch**: hardware exposes one rotary value (−65..0 deg,
  0 = closed); the model has two prismatic finger joints (0..0.044 m) slaved by an equality
  constraint. Bridging needs the linear remap we already use on the Thor rig
  (real [−65, 0] → finger slide travel).
- Bimanual qpos layout is 18-wide: `[L j1..j7, L finger1, L finger2, R j1..j7, R finger1,
  R finger2]` — same layout the thor-openarm sim bridge documents (that bridge targets the
  **v2** file shipped in this same repo; v1 and v2 share the 7+2-per-arm structure).

## 3. Mesh assets (v1)

Split visual/collision, sizes summed from GitHub blob sizes (= bytes on disk):

| Set | Format | Files | Size |
|---|---|---|---|
| `v1/meshes/visual/` (arm 22, body 6, gripper 4) | OBJ | 32 | 42,586,547 B ≈ **42.6 MB** |
| `v1/meshes/collision/` (arm 8, body 1, gripper 2) | STL | 11 | 2,498,724 B ≈ **2.5 MB** |
| **Total** | | **43** | **≈ 45.1 MB** |

(For contrast: v0.3 is STL-only; v2 uses OBJ+MTL visual + STL collision. The OBJs are
plain-text — they gzip well, worth remembering if we serve them from the web app.)

## 4. Official URDF — yes

**`enactic/openarm_description`** — "URDF/xacro description files for the OpenArm robot
system", Apache-2.0. OpenArm v1 lives at `assets/robot/openarm_v1.0/urdf/`: entry point
`openarm_v10.urdf.xacro` with arm/body/end-effector macros, `ros2_control` xacros (single +
bimanual), and a **pre-compiled plain URDF** at
`assets/robot/openarm_v1.0/urdf/example/v1.urdf`. A v2.0 tree exists alongside
(`openarm_v20.urdf.xacro`, `example/v2.urdf`). docs.openarm.dev is Enactic's official doc
site for the same project.

## 5. License — Apache-2.0, vendoring is fine

Repo `LICENSE` is **Apache License 2.0**; every XML carries an Apache-2.0 header,
"Copyright 2025 Enactic, Inc." (openarm_description is Apache-2.0 too). That means:

- **Vendoring MJCF + meshes into our private repo: allowed.** Apache-2.0 permits
  redistribution, modification, private and commercial use; no copyleft.
- **Serving meshes from our web app: allowed** (it's just distribution).
- Obligations: keep the LICENSE text with the vendored copy, retain the copyright headers
  in the XMLs, and note our modifications if we change the files. No NOTICE file exists
  upstream, so nothing extra to carry.

## 6. Position control in the mujoco Python package

What the model implies: the arm actuators are raw torque motors, and the official docs say
so outright — docs.openarm.dev/simulation/mujoco: *"MuJoCo uses torque control for
actuators. This enables more realistic simulation, but requires control to be handled by
client code."* Writing a joint angle into `data.ctrl` on the v1 arms as-is would apply it
as **torque in N·m**, not a position target.

Three routes, in recommended order:

1. **Position actuators in the XML** (recommended for physical sim). MuJoCo's XML reference:
   the `<position>` element "creates a position servo with an optional first-order filter" —
   a built-in PD (gainprm kp, biasprm kv) evaluated inside the solver, implicitly damped and
   therefore stable at larger kp than a hand-rolled loop. The model already does exactly
   this for the right gripper (`<position ... kp="100" ctrlrange="0 0.044">`). Patch the
   arm actuators to `<position>` (via a vendored XML edit or `mjSpec` at load time), then
   write target radians into `data.ctrl` each step.
2. **PD in Python writing torques to `data.ctrl`** — legitimate (MuJoCo's computation docs:
   "the control inputs for all actuators are stored in mjData.ctrl"), and it mirrors how
   the real Damiao motors run MIT-mode impedance control, but you own gain tuning and
   stability at the sim timestep. Use only if we need to replicate hardware gains.
3. **`data.qpos` overwrite is not control** — it teleports the state, bypassing dynamics
   and contact resolution. Legitimate only for resets and for pure-playback rendering
   (which is fine for BotCortex plan-view visualization); never for closed-loop sim.

## Sources

- <https://github.com/enactic/openarm_mujoco> @ `ebc5cd29a957` — `v1/openarm_bimanual.xml`,
  `v1/openarm.xml`, `v1/scene.xml`, `README.md`, `LICENSE`, git tree (mesh sizes)
- <https://github.com/enactic/openarm_description> @ `6c7b720f1ba4` — v1.0 xacro/URDF tree
- <https://docs.openarm.dev/simulation/mujoco/> — torque-control statement, usage
- <https://mujoco.readthedocs.io/en/stable/XMLreference.html> (`actuator/position`),
  <https://mujoco.readthedocs.io/en/stable/computation/index.html> (`mjData.ctrl`)
- GitHub org listings for `reazon-research` and `enactic` (URDF search, rename check)
