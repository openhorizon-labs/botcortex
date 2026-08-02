# Research: browser pipeline for OpenArm meshes — urdf-loader vs GLB in R3F

Resolves [#5](https://github.com/openhorizon-labs/botcortex/issues/5). Researched 2026-08-02
from primary sources (npm registry, GitHub trees/READMEs, drei docs, gltf-transform docs,
Next 16.2 bundled docs). Versions were read live from npm, not from memory.

## TL;DR — recommendation

**Hybrid pipeline: `urdf-loader` for kinematics + one-time per-link mesh conversion to
meshopt-compressed GLB.** Ship the official bimanual URDF (30 KB of XML) and let
urdf-loader build the joint hierarchy at runtime — named joints for free, posed with
`robot.setJointValue(name, rad)` from the WebSocket stream. But do NOT let it load the
official visual meshes (5–11 MB DAE per link, ~73 MB scene): convert each visual mesh
once, offline, to a decimated meshopt GLB (~95 % smaller), and point urdf-loader at the
GLBs via `loadMeshCb`. No rigged-GLB export step exists that is maintained enough to bet
2 days on; this hybrid needs zero rigging and keeps the robot description as the source
of truth.

Packages (verified current on npm, 2026-08-02, all compatible with React 19.2.4):

| package | version | peer notes | size (min / gz) |
|---|---|---|---|
| `three` | 0.185.1 | — | 726 KB / 182 KB |
| `@react-three/fiber` | 9.7.0 | react >=19 <19.3, three >=0.156 | 163 KB / 52 KB |
| `@react-three/drei` | 10.7.7 | react ^19, fiber ^9, three >=0.159 | tree-shakeable (`sideEffects: false`); full 1.6 MB / 496 KB, realistic imported slice ~30–60 KB gz |
| `urdf-loader` | 0.13.1 | three >=0.152 | 13 KB / 4 KB |
| `@gltf-transform/cli` (dev only) | 4.4.2 | — | build-time |

Everything loads lazily in the `/app` route; the landing page pays 0 bytes (§6).

## 1. The assets — what actually exists

The OpenArm repos live under the **`enactic`** org (reazon-research URLs redirect;
`openarm_mjcf` is now `enactic/openarm_mujoco`). Two description sources:

**`enactic/openarm_description`** — "URDF/xacro description files for the OpenArm robot
system". Key facts from the repo tree (`main`):

- A **compiled, plain, bimanual URDF already exists**:
  `assets/robot/openarm_v1.0/urdf/example/v1.urdf` (29,972 B). No xacro toolchain needed.
  (This also answers the sibling ticket: yes, a URDF exists.)
- Joint names in `v1.urdf`: `openarm_left_joint1`…`openarm_left_joint7` and
  `openarm_right_joint1`…`openarm_right_joint7` (revolute), fixed body/world joints,
  plus parallel-link gripper finger joints. Clean per-arm naming — maps 1:1 onto the
  runtime's per-arm joint state messages.
- **Both arms reference the same 8 mesh files**; the left arm is mirrored with
  `scale="0.001 -0.001 0.001"` (negative Y). So unique visual payload = 1 arm + body +
  gripper, and the browser fetches each file once.
- Visual mesh sizes (v1.0, DAE): link0–7 = 5.36 + 7.66 + 6.29 + 6.85 + 6.64 + 9.03 +
  6.13 + 6.29 MB ≈ **54.2 MB per arm**; `body_link0.dae` 10.8 MB; gripper `hand.dae`
  1.55 MB + `finger.dae` 6.0 MB. **Unique-file total for the bimanual scene ≈ 73 MB
  raw** (DAE is XML; maybe 15–20 MB gzipped on the wire — still far too heavy).
  STL visual variants exist too: 4.1–6.3 MB per link, ~40 MB/arm (binary, compresses
  worse).
- Collision meshes are tiny: `*_symp.stl` link0–7 ≈ **2.2 MB total per arm**, body
  0.29 MB. (Useful — see fallback tiers, §7.)

**`enactic/openarm_mujoco`** — MJCF + assets. v1 visual meshes are split OBJ
(~34 MB/arm), collision STL. There is **no maintained MJCF loader for three.js**, so
this repo is not the browser source; use `openarm_description`. Verdict on the ticket's
"is one-time conversion warranted" question: **emphatically yes** — 73 MB raw / ~15 MB
gz is not shippable; a decimate + compress pass typically lands robot CAD meshes in the
**2–6 MB total** range.

## 2. Option A: `urdf-loader` (gkjohnson/urdf-loaders)

- **Current version 0.13.1** (published to npm 2026-07-08 — actively maintained), peer
  dep `three >= 0.152`. 13 KB min / 3.9 KB gz.
- Load pattern (README, verbatim API):

  ```js
  import URDFLoader from 'urdf-loader';
  const loader = new URDFLoader(manager);
  loader.packages = { openarm_description: '/robot/openarm' }; // package:// → URL
  loader.load('/robot/openarm/urdf/v1.urdf', robot => scene.add(robot));
  ```

  `packages` resolves the URDF's `package://openarm_description/...` references — no
  editing of the official file required.
- **Joints by name, posed programmatically** (README):
  `robot.setJointValue(jointName, jointAngle)` or
  `robot.joints[jointName].setJointValue(angle)`. `robot.joints` is a name → URDFJoint
  map; each joint carries `limit.lower/upper` from the URDF. Exactly matches
  "named joints per arm over WebSocket".
- **Mesh formats**: default loader handles **STL** (`STLLoader`) and **DAE**
  (`ColladaLoader`) only, by file extension; anything else needs `loadMeshCb`
  (`(path, manager, done) => …`) — the README's own example uses `loadMeshCb` with
  `GLTFLoader`, which is precisely the hook the hybrid pipeline uses.
- Options: `packages`, `workingPath`, `parseVisual` (default true), `parseCollision`
  (default false), `fetchOptions`.
- **R3F integration** — no official R3F example in the repo; the canonical community
  pattern (wty-andrew, "Load URDF with React Three Fiber") is:

  ```tsx
  const robot = useLoader(URDFLoader as any, URDF_URL, loader => {
    loader.packages = { openarm_description: '/robot/openarm' };
    loader.loadMeshCb = …;
  });
  // in JSX — URDFRobot is an Object3D subclass:
  <primitive object={robot} rotation-x={-Math.PI / 2} />
  ```

  (`as any` because URDFLoader's TS types don't extend three's `Loader<T>` generic;
  `rotation-x={-Math.PI/2}` converts robotics Z-up → three.js Y-up.) Joint updates go
  in the WS message handler / `useFrame`, not React state — no re-render per frame.
- **Next.js caveat** (vercel/next.js discussion #66591): wrapping the *loader module*
  in `next/dynamic` froze the loader object ("Cannot add property loadMeshCb, object is
  not extensible"). Fix: `import URDFLoader from 'urdf-loader'` statically **inside the
  client-only component module**, and dynamic-import that component instead.

## 3. Option B: full conversion to a rigged GLB

Tooling landscape for STL/DAE + URDF → single rigged GLB with named joint nodes:

- **No first-class maintained tool exists.** The options are all Blender-mediated:
  - `robotology/blender-robotics-utils` — `urdfToBlender.py` builds bones/meshes/limits
    from a URDF headlessly; closest to maintained, but adds a Blender + Python
    dependency and its rigs target Blender armatures, not plain named nodes.
  - `dfki-ric/phobos` — Blender add-on with URDF import/export; tested against
    **Blender 3.3 LTS** (aging).
  - One-off gists (jmpinit's URDF→rigged-FBX walkthrough, mikedh's robot-gltf notes).
- Node-name posing of a GLB via drei `useGLTF` works, but you must re-implement joint
  axes/limits/transform composition yourself — re-deriving exactly what urdf-loader
  already does from the URDF, with a fragile Blender step in between.
- **Per-mesh (unrigged) conversion, by contrast, is well supported**: Blender 4.x
  headless (imports DAE/STL/OBJ, exports glTF — Khronos-maintained exporter), CesiumGS
  `obj2gltf` 3.2.0 (OBJ only, last publish 2025-11), or a ~50-line Node/Bun script
  using three's ColladaLoader/STLLoader + GLTFExporter (needs a DOMParser shim for DAE
  in Node, e.g. jsdom). Then `@gltf-transform/cli` 4.4.2 (actively maintained, last
  publish 2026-07-25) does the heavy lifting on the glTF side: `optimize` (weld,
  simplify via meshoptimizer, quantize) with `--compress draco|meshopt`. gltf-transform
  does **not** ingest OBJ/STL/DAE itself — it only processes glTF/GLB, hence the
  two-step.

**Verdict: full rigged-GLB is the wrong 2-day bet; per-mesh GLB conversion is cheap and
robust.** That yields the hybrid below.

## 4. Recommended pipeline (2-day plan)

**Install** (app deps + build-time tools):

```sh
bun add three@0.185.1 @react-three/fiber@9.7.0 @react-three/drei@10.7.7 urdf-loader@0.13.1
bun add -d @gltf-transform/cli@4.4.2
```

**Step 1 — vendor the description** (one-time, checked into `public/`):
copy `v1.urdf` → `public/robot/openarm/urdf/v1.urdf` and the visual meshes into a
scratch dir for conversion. Everything under `public/` is copied verbatim into `out/`
by `output: "export"` and served at stable root paths — no asset-path surprises.

**Step 2 — convert meshes** (one-time script, `scripts/convert-openarm-meshes.ts`):
DAE → GLB per link (Blender 4.x headless is the lowest-friction converter for DAE; the
three.js GLTFExporter route works too with a jsdom DOMParser shim), then:

```sh
gltf-transform optimize link3.glb link3.glb --compress meshopt --simplify-error 0.001
```

Output: `public/robot/openarm/mesh/{link0…link7,body_link0,hand,finger}.glb`.
Target ≤ 5 MB total for the bimanual scene (from 73 MB). **Choose meshopt over draco**:
the meshopt decoder ships as inline base64 WASM inside the JS bundle — no decoder
files to host, no worker/wasm path issues under static export, works offline on the
robot's LAN. (Draco remains viable — drei defaults its decoder to the gstatic CDN
`https://www.gstatic.com/draco/v1/decoders/` and DRACOLoader spawns its worker from a
Blob, so the only hosting concern is the decoder files themselves, solvable with
`useGLTF.setDecoderPath('/draco/')` + files in `public/draco/`. Meshopt simply removes
the concern.)

**Step 3 — the component** (`components/app/robot-view.tsx`, `'use client'`):
`useLoader(URDFLoader, url, loader => { loader.packages = …; loader.loadMeshCb = … })`
where `loadMeshCb` rewrites `*.dae` → `/robot/openarm/mesh/*.glb` and loads with a
`GLTFLoader` that has `MeshoptDecoder` attached (from `three/addons` /
`three-stdlib`; drei's `useGLTF` enables meshopt by default, but here the GLTFLoader
lives inside `loadMeshCb`, so attach it explicitly). Memoize by path so the mirrored
left arm reuses the right arm's fetch. Render `<primitive object={robot}
rotation-x={-Math.PI/2} />`, grayscale material override per the design system.

**Step 4 — drive it from the WebSocket** (RobotProvider): on each ~15 Hz joint-state
message, `robot.setJointValue('openarm_left_joint1', rad)` etc. — imperative, no React
state. Use `<Canvas frameloop="demand">` + `invalidate()` per message so the GPU only
renders at stream rate; optionally lerp toward targets in `useFrame` for smoothness.

**Step 5 — lazy mount** (§6) and ship.

Watch-item: the left arm's negative-Y mirror scale flips triangle winding; if left-arm
shading renders inside-out, set `material.side = THREE.DoubleSide` on arm materials (or
bake mirrored copies during conversion). Verify on first render.

## 5. Next.js 16.2 static-export gotchas (checked against the bundled v16.2.12 docs)

- R3F's `<Canvas>` and anything touching `window` must live in `'use client'`
  components. `next/dynamic` with `ssr: false` **still exists in Next 16 but is only
  allowed inside Client Components** — using it in a Server Component is an error
  (`docs/01-app/02-guides/lazy-loading.md`). Pattern: a small client wrapper does
  `dynamic(() => import('./robot-view'), { ssr: false })`; the page imports the wrapper.
- Do **not** dynamic-import the `urdf-loader` module itself (frozen-namespace issue,
  §2); dynamic-import the component, static-import the loader inside it.
- `output: "export"` = no API routes, no server. The workaround in next.js discussion
  #66591 (serving URDFs from an API route) is unavailable — irrelevant here since URDF
  + GLBs are plain static files in `public/`. No CORS, same origin.
- Draco worker/wasm: only a concern if draco is chosen — self-host decoder files under
  `public/draco/` (or accept drei's gstatic CDN default). Meshopt sidesteps it.
  Workers themselves are Blob-spawned by DRACOLoader, fine on static hosts.

## 6. Bundle impact & lazy-loading strategy

Measured (bundlephobia, exact versions): three 182 KB gz + fiber 52 KB gz + drei slice
~30–60 KB gz (tree-shakeable; import only `Canvas` helpers/`OrbitControls`/`useGLTF`) +
urdf-loader 4 KB gz + meshopt decoder ~25 KB. **Realistic added JS ≈ 250–300 KB gz, all
in an async chunk.** Strategy:

- The 3D view lives only under `/app` — Next already code-splits per route, so the
  marketing landing (`/`) pays **zero bytes**.
- Inside `/app`, the `dynamic(…, { ssr: false })` wrapper defers the three/fiber/drei/
  urdf-loader chunk until the component mounts (optionally gated on visibility /
  robot-connected state), behind a `<Suspense>` skeleton panel.
- Meshes (~5 MB GLB) stream after the chunk; `useGLTF.preload`-style warmup optional.

## 7. Fallback tiers (if meshes prove problematic)

1. **Collision meshes** — flip `parseVisual: false, parseCollision: true`: the official
   `*_symp.stl` set is only ~2.2 MB/arm raw and urdf-loader loads STL natively with
   zero conversion. Real silhouette, same joints, one-line change. This is also the
   day-1 bring-up path while the GLB conversion runs.
2. **Parametric primitives** — a `'use client'` R3F component building each arm from
   capsules/cylinders/boxes at the joint origins in
   `assets/robot/openarm_v1.0/config/arm/kinematics.yaml`, consuming the **same**
   `{jointName: rad}` map as the URDF view (shared interface, swap-in component).
   Monochrome primitives actually sit close to the grayscale design system; worst case
   it becomes the aesthetic, not the fallback.

## Sources

- npm registry (versions/peers, 2026-08-02): `urdf-loader` 0.13.1, `three` 0.185.1,
  `@react-three/fiber` 9.7.0, `@react-three/drei` 10.7.7, `@gltf-transform/cli` 4.4.2,
  `obj2gltf` 3.2.0, `xacro-parser` 0.3.11
- github.com/gkjohnson/urdf-loaders — javascript/README.md + src/URDFLoader.js
- github.com/enactic/openarm_description + enactic/openarm_mujoco — full git trees (file sizes)
- enactic/openarm_description `assets/robot/openarm_v1.0/urdf/example/v1.urdf` (joint names, mesh refs, mirror scales)
- wty-andrew.github.io/misc/r3f-urdf/ — R3F integration pattern
- github.com/vercel/next.js/discussions/66591 — urdf-loader + next/dynamic freeze issue
- drei.docs.pmnd.rs/loaders/gltf-use-gltf — useGLTF signature, draco CDN default, meshopt default
- gltf-transform.dev/cli — optimize/draco/meshopt/simplify commands; glTF-only input
- bundlephobia.com API — exact min/gz sizes at the pinned versions
- node_modules/next/dist/docs (v16.2.12) — lazy-loading.md (`ssr:false` client-only), static-exports.md
- robotology/blender-robotics-utils, dfki-ric/phobos — URDF→Blender rigging landscape
