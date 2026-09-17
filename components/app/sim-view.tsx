"use client";

/**
 * The simulation viewport — the OpenArm posed live from the runtime's ~15 Hz
 * joint-state stream.
 *
 * Geometry: the official URDF's VISUAL meshes, converted once from 78 MB of
 * COLLADA to 6.3 MB of decimated GLB (see scripts/ in the description vendor
 * pass). Materials ride along, so the arm renders in its real colors; the
 * collision hulls the runtime uses for physics are deliberately not drawn.
 *
 * Import via next/dynamic({ ssr: false }) only — three.js is browser-only, and
 * urdf-loader itself must be imported statically (dynamic-importing that module
 * hangs the dev server: vercel/next.js#66591).
 */

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LoadingManager,
  type Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  SphereGeometry,
  type Texture,
  Vector3,
} from "three";
import URDFLoader, { type URDFRobot } from "urdf-loader";

import type { JointState, Kinematics, RobotInfo, SceneBodies, SceneBody } from "@/lib/robot/protocol";
import { bodyFor } from "@/lib/robot/bodies";
import { tapFrames } from "@/lib/gif";
import { useRobot } from "@/components/app/robot-provider";

/**
 * How fast the drawn pose catches up to the reported one, per second.
 *
 * The robot streams joint state at 15 Hz and the canvas renders at ~60. Setting
 * each joint to the last message held every pose for four frames and then
 * jumped, so a smooth 20 Hz motion was DISPLAYED as fifteen visible steps a
 * second. The arm looked broken while behaving perfectly.
 *
 * This is honest about a real cost: the view now TRAILS the truth, by roughly
 * a frame of the stream (~50 ms at this rate). That is a rendering choice and
 * nothing else reads these values — the trace, the tool results and the
 * verification gate all use the robot's own numbers. It is worth saying out
 * loud in a repo that argues about honesty elsewhere: what you watch is a
 * smoothed replay of what happened, a twentieth of a second behind.
 */
const CATCH_UP = 18;

/** Scratch, allocated once. A new Vector3 per object per frame at 60 Hz is
 *  thousands of allocations a second for no reason. */
const TARGET = new Vector3();
const SPIN = new Quaternion();

/** Ease a value toward a target, framerate-independent. */
function approach(
  shown: Map<string, number>,
  key: string,
  target: number,
  delta: number,
): number {
  const current = shown.get(key);
  // First sight of a joint snaps: easing in from zero would swing the whole
  // arm across the screen when the page loads.
  const next =
    current === undefined ? target : MathUtils.damp(current, target, CATCH_UP, delta);
  shown.set(key, next);
  return next;
}

const ROOT = "/robots/openarm_v1";
const PACKAGES = { openarm_description: ROOT };
const URDF = `${ROOT}/v1.urdf`;
/**
 * Only used until a robot has said hello. openarm_v1's numbers, and a fallback
 * for exactly one frame — not a definition.
 *
 * This function used to BE the definition, with -65 and 0.044 written into it,
 * which quietly made it a third implementation of the mapping that
 * `jointmap.py` owns and that `test_it_contains_no_arithmetic` guards. Correct
 * for openarm_v1 and silently wrong for the platform after it: the jaw would
 * render at the wrong opening with nothing anywhere reporting a problem. The
 * robot carries its own mapping in `hello` now.
 */
const ASSUMED_GRIPPER: GripperMap = { minDeg: -65, maxDeg: 0, travelM: 0.044 };

type GripperMap = { minDeg: number; maxDeg: number; travelM: number };

/** The inverse of JointMap.gripper_deg_to_m, driven by the robot's own limits.
 *  The vendor range runs negative-open to zero-closed; that inversion is real. */
function gripperDegToMeters(deg: number, map: GripperMap): number {
  const { minDeg: lo, maxDeg: hi, travelM } = map;
  return ((hi - deg) / (hi - lo)) * travelM;
}

/**
 * Platforms drawn with the OpenArm URDF below. The browser sim reports `wasm`
 * and the mock runtime `mock`; both are twins of openarm_v1. Any other
 * platform gets the workcell and grid but NOT this arm — a robot that is not
 * an OpenArm must not be silently rendered as one.
 */
const ARM_PLATFORMS = new Set(["openarm_v1", "wasm", "mock"]);


/** Free every GPU object an Object3D tree owns. three.js never does this on
 *  its own: removing a mesh from the scene leaves its buffers on the GPU. */
function disposeTree(root: Object3D) {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry?.dispose();
    const materials: Material[] = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && (value as Texture).isTexture) (value as Texture).dispose();
      }
      material.dispose();
    }
  });
}

const sameTriple = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * The workcell: table, trays, blocks.
 *
 * Boxes, posed straight from the robot's own report — position, orientation,
 * size and colour all come down the wire, so nothing here decides what a scene
 * contains or what colour a "red block" is. Before this the viewer drew an arm
 * alone in a void while the simulation it was mirroring had a table with three
 * blocks on it, which made every manipulation task impossible to follow.
 */
/** What this body looks like, as a key. Its own box, plus every part box —
 *  so a container that gains or loses a wall is rebuilt rather than patched. */
function shapeOf(body: SceneBody): string {
  const parts = (body.parts ?? [])
    .map((p) => `${p.size_m.join(",")}@${p.position.join(",")}`)
    .join("|");
  return `${body.size_m.join(",")}#${parts}`;
}

function Workcell({
  objectsRef,
  fixturesRef,
}: {
  objectsRef: React.RefObject<SceneBodies | null>;
  fixturesRef: React.RefObject<SceneBodies | null>;
}) {
  const group = useRef<Group>(null);
  /** Each drawn body with the shape it was built from, so a changed report
   *  replaces the geometry instead of keeping a stale box. `shape` covers the
   *  parts too, because a container's walls are part of what it looks like. */
  const drawn = useRef<Map<string, { mesh: Object3D; shape: string; colour: number[] }>>(new Map());

  // Everything in the map is owned here; free it when the scene goes away.
  useEffect(() => {
    const owned = drawn.current;
    return () => {
      for (const { mesh } of owned.values()) {
        mesh.removeFromParent();
        disposeTree(mesh);
      }
      owned.clear();
    };
  }, []);

  useFrame((_, delta) => {
    if (!group.current) return;
    const bodies = { ...(fixturesRef.current ?? {}), ...(objectsRef.current ?? {}) };
    // A body the robot no longer reports — a different scene, a reset that
    // removed a block — leaves the view too, GPU buffers included.
    for (const [name, entry] of drawn.current) {
      if (name in bodies) continue;
      entry.mesh.removeFromParent();
      disposeTree(entry.mesh);
      drawn.current.delete(name);
    }
    for (const [name, body] of Object.entries(bodies)) {
      let entry = drawn.current.get(name);
      const fresh = !entry;
      const shape = shapeOf(body);
      if (entry && entry.shape !== shape) {
        // The body is a different shape than what is drawn. Rebuilding beats
        // patching: a tray that gained walls is not a resized box.
        entry.mesh.removeFromParent();
        disposeTree(entry.mesh);
        drawn.current.delete(name);
        entry = undefined;
      }
      if (!entry) {
        // Built on first sight rather than from a fixed list: a platform with
        // a different workcell needs no change here.
        //
        // A body made of several boxes is drawn as several boxes. Without
        // this a tray is its floor geom alone — a flat plate — and a tray and
        // a shallow pocket render identically, which is exactly how they
        // looked. Parts carry world positions; they are placed relative to the
        // body origin so the body's own easing and rotation still apply.
        const material = new MeshStandardMaterial({
          color: new Color(body.colour[0], body.colour[1], body.colour[2]),
          roughness: 0.75,
          metalness: 0.02,
        });
        const box = (size: readonly number[]) => {
          const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          return mesh;
        };
        let object: Object3D;
        if (body.parts && body.parts.length > 1) {
          const shell = new Group();
          for (const part of body.parts) {
            const piece = box(part.size_m);
            piece.position.set(
              part.position[0] - body.position[0],
              part.position[1] - body.position[1],
              part.position[2] - body.position[2],
            );
            shell.add(piece);
          }
          object = shell;
        } else {
          object = box(body.size_m);
        }
        entry = { mesh: object, shape, colour: [...body.colour] };
        drawn.current.set(name, entry);
        group.current.add(object);
      } else if (!sameTriple(entry.colour, body.colour)) {
        entry.mesh.traverse((child) => {
          if (child instanceof Mesh) {
            (child.material as MeshStandardMaterial).color.setRGB(
              body.colour[0],
              body.colour[1],
              body.colour[2],
            );
          }
        });
        entry.colour = [...body.colour];
      }
      const mesh = entry.mesh;
      // MuJoCo quaternions are wxyz; three.js wants xyzw.
      const [w, x, y, z] = body.orientation;
      TARGET.set(...body.position);
      SPIN.set(x, y, z, w);
      if (fresh) {
        // First sight snaps. Easing in from the origin would fling every block
        // across the table on the first frame after connecting.
        mesh.position.copy(TARGET);
        mesh.quaternion.copy(SPIN);
      } else {
        // Same easing as the arm, for the same reason: a block carried by a
        // smoothly-drawn arm must not itself arrive in 15 Hz steps.
        const t = 1 - Math.exp(-CATCH_UP * delta);
        mesh.position.lerp(TARGET, t);
        mesh.quaternion.slerp(SPIN, t);
      }
    }
  });

  // Z-up in, Y-up out — the same -90 degrees about x the arm gets. Doing it on
  // the GROUP rather than per box means positions, sizes and quaternions all
  // stay exactly as the robot reported them: MuJoCo's (x, y, z) with z up.
  // Converting each mesh by hand is how the table came out 1.1 m TALL, because
  // BoxGeometry reads its second argument as height.
  return <group ref={group} rotation={[-Math.PI / 2, 0, 0]} />;
}

/**
 * A robot drawn from its MuJoCo model rather than a URDF: every body except
 * the OpenArm, which has decimated GLBs with material colours.
 *
 * Named for the primitive geoms it started with — the RoArm is boxes and
 * cylinders — but it draws mesh geoms too, which is how the four Menagerie
 * arms render their official geometry without a single extra asset: the
 * vertices arrive in the hello, already compiled by the physics that will
 * move them.
 *
 * The tree comes from the runtime in the hello (worker.ts `kinematics()`):
 * bodies with their pose in the parent's frame, joints with an axis and an
 * anchor in the body frame, primitive geoms. Each joint becomes a pivot group
 * at its anchor whose rotation (hinge) or offset (slide) is driven from the
 * joint stream through `drive` — q = a·deg + b, the same numbers the runtime's
 * JointMap writes into physics, so the drawn jaw closes the way the simulated
 * one does. Eased with the same CATCH_UP as the URDF arm, for the same reason.
 *
 * MuJoCo's capsule and cylinder axes are z; three.js's are y. Each such geom
 * sits in a group turned +90° about x, so its size and pose stay exactly as
 * the model states them and nothing here does frame arithmetic by hand.
 */
function PrimitiveRobot({
  stateRef,
  kinematics,
}: {
  stateRef: React.RefObject<JointState | null>;
  kinematics: Kinematics;
}) {
  const root = useRef<Group>(null);
  /** joint name → its pivot, anchor, axis and type, for the per-frame drive. */
  const pivots = useRef(new Map<string, { pivot: Group; anchor: Vector3; axis: Vector3; slide: boolean }>());
  const shown = useRef(new Map<string, number>());

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const groups = new Map<string, Object3D>([["world", host]]);
    const owned: Object3D[] = [];
    for (const body of kinematics.bodies) {
      const parent = groups.get(body.parent) ?? host;
      const frame = new Group();
      frame.position.set(body.pos[0], body.pos[1], body.pos[2]);
      frame.quaternion.set(body.quat[1], body.quat[2], body.quat[3], body.quat[0]);
      parent.add(frame);
      owned.push(frame);
      // Joints nest: the innermost holds the geoms and the child bodies.
      let inner: Object3D = frame;
      for (const joint of body.joints) {
        if (joint.type === "other") continue;
        const anchor = new Vector3(joint.pos[0], joint.pos[1], joint.pos[2]);
        const pivot = new Group();
        pivot.position.copy(anchor);
        const back = new Group();
        back.position.copy(anchor).negate();
        pivot.add(back);
        inner.add(pivot);
        pivots.current.set(joint.name, {
          pivot,
          anchor,
          axis: new Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize(),
          slide: joint.type === "slide",
        });
        inner = back;
      }
      for (const geom of body.geoms) {
        let geometry: BufferGeometry;
        let turned = false;
        switch (geom.type) {
          case "mesh": {
            const mesh = geom.mesh ? kinematics.meshes?.[geom.mesh] : undefined;
            const buffer = kinematics.meshBuffer;
            if (!mesh || !buffer) continue;
            // Views onto the transferred buffer, not copies of it: three.js
            // uploads these to the GPU and never needs them to be JS numbers.
            geometry = new BufferGeometry();
            geometry.setAttribute(
              "position",
              new BufferAttribute(new Float32Array(buffer, mesh.vertexOffset, mesh.vertexCount), 3),
            );
            geometry.setIndex(
              new BufferAttribute(new Uint32Array(buffer, mesh.faceOffset, mesh.faceCount), 1),
            );
            geometry.computeVertexNormals();
            break;
          }
          case "box":
            geometry = new BoxGeometry(geom.size[0] * 2, geom.size[1] * 2, geom.size[2] * 2);
            break;
          case "sphere":
            geometry = new SphereGeometry(geom.size[0], 24, 16);
            break;
          case "capsule":
            geometry = new CapsuleGeometry(geom.size[0], geom.size[1] * 2, 6, 16);
            turned = true;
            break;
          case "cylinder":
            geometry = new CylinderGeometry(geom.size[0], geom.size[0], geom.size[1] * 2, 24);
            turned = true;
            break;
        }
        const mesh = new Mesh(
          geometry,
          new MeshStandardMaterial({
            color: new Color(geom.rgba[0], geom.rgba[1], geom.rgba[2]),
            roughness: 0.6,
            metalness: 0.15,
          }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const placed = new Group();
        placed.position.set(geom.pos[0], geom.pos[1], geom.pos[2]);
        placed.quaternion.set(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]);
        if (turned) mesh.rotation.x = Math.PI / 2;
        placed.add(mesh);
        inner.add(placed);
      }
      groups.set(body.name, inner);
    }
    const map = pivots.current;
    return () => {
      for (const node of owned) {
        node.removeFromParent();
        disposeTree(node);
      }
      map.clear();
      shown.current.clear();
    };
  }, [kinematics]);

  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!state) return;
    for (const [arm, joints] of Object.entries(state)) {
      const drive = kinematics.drive[arm];
      if (!drive) continue;
      for (const [joint, deg] of Object.entries(joints)) {
        for (const { joint: name, a, b } of drive[joint] ?? []) {
          const entry = pivots.current.get(name);
          if (!entry) continue;
          const q = approach(shown.current, name, a * deg + b, delta);
          if (entry.slide) {
            entry.pivot.position.copy(entry.anchor).addScaledVector(entry.axis, q);
          } else {
            entry.pivot.quaternion.setFromAxisAngle(entry.axis, q);
          }
        }
      }
    }
  });

  // Z-up to Y-up on the root, exactly as the workcell does it.
  return <group ref={root} rotation={[-Math.PI / 2, 0, 0]} />;
}

function ArmModel({
  stateRef,
  gripper,
  onError,
}: {
  stateRef: React.RefObject<JointState | null>;
  gripper: GripperMap;
  /** A mesh or the URDF failed to load — reported once, outside the canvas. */
  onError: () => void;
}) {
  const [robot, setRobot] = useState<URDFRobot | null>(null);

  useEffect(() => {
    // Closing and reopening the panel remounts this scene. Without cleanup
    // every mount left its Draco decoder worker and 6 MB of GPU buffers
    // behind, and a URDF still in flight would set state on a dead component.
    let cancelled = false;
    let loaded: URDFRobot | null = null;
    // One manager shared by the URDF and every mesh: urdf-loader's own callback
    // fires as soon as the XML is parsed, while meshes are still in flight, so
    // anything that needs real geometry (like fitting the robot to the floor)
    // has to wait for manager.onLoad instead.
    const manager = new LoadingManager();
    const gltf = new GLTFLoader(manager);
    // Meshes are Draco-compressed (63 MB of COLLADA → 3 MB) with the decoder
    // served from /public, never a CDN — this has to work offline.
    const draco = new DRACOLoader(manager);
    draco.setDecoderPath("/draco/");
    gltf.setDRACOLoader(draco);
    const loader = new URDFLoader(manager);
    loader.packages = PACKAGES;
    loader.parseVisual = true;
    loader.parseCollision = false;

    // The URDF points at .dae; we ship decimated .glb beside it.
    // Signature is (path, manager, material, onComplete) — the material comes
    // from the URDF's <material> tag and is ignored: GLB carries its own.
    type MeshDone = (mesh: Object3D | null, err?: Error) => void;
    const loadMesh = (
      path: string,
      _manager: LoadingManager,
      _material: unknown,
      done: MeshDone,
    ) => {
      gltf.load(
        path.replace(/\.dae$/i, ".glb"),
        (result) => done(result.scene),
        undefined,
        (err) => {
          console.error("[sim] mesh failed:", path, err);
          if (!cancelled) onError();
          done(null, err as Error);
        },
      );
    };
    loader.loadMeshCb = loadMesh as unknown as typeof loader.loadMeshCb;
    manager.onError = () => {
      if (!cancelled) onError();
    };

    loader.load(URDF, (result) => {
      if (cancelled) {
        disposeTree(result);
        return;
      }
      loaded = result;
      loaded.rotation.x = -Math.PI / 2; // URDF is Z-up; three.js is Y-up

      manager.onLoad = () => {
        if (cancelled || !loaded) return;
        loaded.traverse((child: Object3D) => {
          if (child instanceof Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // The URDF mirrors the left arm with scale="0.001 -0.001 0.001".
            // A negative determinant flips face winding, so back-face culling
            // would show the inside of those shells — hence DoubleSide.
            // Colours/metalness now come from the GLB itself; don't override.
            const material = child.material as MeshStandardMaterial;
            if (material) {
              material.side = DoubleSide;
              // There is no environment map (see the lighting note in the
              // Canvas below), and metalness without one reflects pure black.
              // Keep the GLB's colour, drop it to a near-dielectric response
              // so the three lights alone shade it properly.
              material.metalness = 0.05;
              material.roughness = 0.65;
            }
          }
        });

        // Sit the robot on the grid, now that it actually has geometry.
        loaded.updateMatrixWorld(true);
        const box = new Box3().setFromObject(loaded);
        if (Number.isFinite(box.min.y)) loaded.position.y -= box.min.y;
        setRobot(loaded);
      };
    }, undefined, (err) => {
      console.error("[sim] urdf failed:", err);
      if (!cancelled) onError();
    });

    return () => {
      cancelled = true;
      // Late callbacks see `cancelled` and bail; anything already built is
      // freed here. Meshes that land AFTER this runs are disposed by the
      // cancelled branch above, so nothing arrives with no owner.
      manager.onLoad = () => {};
      if (loaded) {
        loaded.removeFromParent();
        disposeTree(loaded);
        loaded = null;
      }
      draco.dispose();
      setRobot(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Where each joint is DRAWN, which trails where the robot says it is. */
  const shown = useRef(new Map<string, number>());

  useFrame((_, delta) => {
    const state = stateRef.current;
    if (!robot || !state) return;
    for (const [arm, joints] of Object.entries(state)) {
      for (const [joint, deg] of Object.entries(joints)) {
        const name =
          joint === "gripper"
            ? `openarm_${arm}_finger_joint1`
            : `openarm_${arm}_joint${joint.slice(1)}`;
        const target =
          joint === "gripper"
            ? gripperDegToMeters(deg, gripper)
            : MathUtils.degToRad(deg);
        // finger_joint2 mimics finger_joint1 — urdf-loader applies it for us.
        robot.setJointValue(name, approach(shown.current, name, target, delta));
      }
    }
  });

  return robot ? <primitive object={robot} /> : null;
}

/** Frames the WORKCELL, not just the arm.
 *
 *  The old target sat on the torso at (0, 0.42, 0), which was right when the
 *  arm was the only thing in the world. With a table in front of the robot it
 *  put the near edge of that table across most of the viewport and the blocks
 *  — the things a manipulation task is actually about — off the bottom of the
 *  frame. Aimed between the torso and the tabletop instead. */
/** Where the camera looks from, as a direction: pulled back and swung round
 *  to the working side, the framing the OpenArm workcell was tuned on. */
const VIEW_DIRECTION = new Vector3(0.95, 0.85, 1.15).normalize();

/**
 * Frame the workcell the robot actually reported, not a fixed point.
 *
 * The target used to be one hard-coded spot chosen for the OpenArm's
 * right-hand workspace, so the RoArm — whose bench sits forward of a base
 * at the origin — was drawn off to the right of the viewport. The centre
 * is now the box around the robot's base and every fixture it reported,
 * and the distance follows that box's size; a new hello re-frames.
 */
function FrameOnLoad({
  fixturesRef,
  frameKey,
  reachM,
}: {
  fixturesRef: React.RefObject<SceneBodies | null>;
  frameKey: string;
  /** The body's reach, from the manifest. The fixtures say how wide the scene
   *  is and nothing said how TALL, so a 0.855 m Panda was framed as if it were
   *  a 0.35 m box and its shoulder sat off the top of the frame. */
  reachM: number;
}) {
  const controls = useRef<any>(null);
  const { camera } = useThree();
  useEffect(() => {
    const fixtures = fixturesRef.current ?? {};
    // Bounds in MuJoCo coordinates (z up), seeded with the robot's base.
    const min = [-0.1, -0.1, 0];
    // An arm standing at the origin sweeps a sphere of its own reach; three
    // quarters of that is the working height, measured across the six bodies.
    const max = [0.1, 0.1, Math.max(0.35, reachM * 0.75)];
    for (const body of Object.values(fixtures)) {
      const [x, y, z] = body.position;
      const [sx, sy, sz] = body.size_m;
      min[0] = Math.min(min[0], x - sx / 2); max[0] = Math.max(max[0], x + sx / 2);
      min[1] = Math.min(min[1], y - sy / 2); max[1] = Math.max(max[1], y + sy / 2);
      min[2] = Math.min(min[2], z - sz / 2); max[2] = Math.max(max[2], z + sz / 2);
    }
    const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.5);
    // Y-up for three.js: (x, y, z)_mujoco -> (x, z, -y).
    const target = new Vector3((min[0] + max[0]) / 2, Math.max(0.15, max[2] * 0.6), -(min[1] + max[1]) / 2);
    camera.position.copy(target).addScaledVector(VIEW_DIRECTION, 1.2 * extent + 0.5);
    camera.lookAt(target);
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
  }, [camera, fixturesRef, frameKey, reachM]);
  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minDistance={0.5}
      maxDistance={3}
      maxPolarAngle={Math.PI / 2.05}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

/**
 * Draws the frame, then hands the canvas to whoever is recording.
 *
 * A positive useFrame priority means "I render" in R3F, so this is the render
 * call itself plus one line. The GIF recorder must copy the canvas in the same
 * call that drew it: a WebGL canvas keeps its picture only until the browser
 * composites it. The alternative, preserveDrawingBuffer, was what made the
 * public player's scene flicker and disappear mid-run.
 */
function RenderAndTap() {
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    tapFrames(gl.domElement);
  }, 1);
  return null;
}

/** What the viewport draws from. The refs are read per frame; `robot` decides
 *  which drawing to use and how to frame it. */
export type SimSource = {
  jointStateRef: React.RefObject<JointState | null>;
  objectsRef: React.RefObject<SceneBodies | null>;
  fixturesRef: React.RefObject<SceneBodies | null>;
  robot: Pick<RobotInfo, "name" | "platform" | "gripper" | "kinematics"> | null;
};

/** The control room's viewer: whatever robot the account is connected to. */
export default function SimView() {
  // Read OUTSIDE the R3F Canvas boundary — the scene is its own React root.
  const { jointStateRef, objectsRef, fixturesRef, robot } = useRobot();
  return <SimViewport jointStateRef={jointStateRef} objectsRef={objectsRef} fixturesRef={fixturesRef} robot={robot} />;
}

/**
 * The viewer itself, fed by props rather than by the robot provider.
 *
 * Split out for the public skill player: that page runs a published skill for
 * someone with no account, so it cannot mount the provider — which exists to
 * tie a robot to an account, restore that account's skills and write back to
 * its registry. The drawing never needed any of that; it needs three refs and
 * a description of the body.
 */
export function SimViewport({ jointStateRef, objectsRef, fixturesRef, robot }: SimSource) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gripper = robot?.gripper ?? ASSUMED_GRIPPER;
  // No robot yet: draw the arm as before. A robot with a URDF here (the
  // OpenArm and its twins) is drawn from it; any other body is drawn from
  // the kinematic tree it sent, and only if it sent one — a robot the viewer
  // cannot describe gets its workcell, a note, and no invented arm.
  const armSupported = !robot || ARM_PLATFORMS.has(robot.platform);
  // How far this body reaches, which is how much room the camera must leave
  // above the table. Zero for a body the manifest does not know.
  const reachM = bodyFor(robot?.platform ?? "openarm_v1").reachM;
  const kinematics = !armSupported ? (robot?.kinematics ?? null) : null;
  const [loadFailed, setLoadFailed] = useState(false);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {!armSupported && !kinematics && (
        <p
          role="status"
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          No 3D model for platform {robot?.platform}
        </p>
      )}
      {armSupported && loadFailed && (
        <p
          role="status"
          className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          3D model failed to load
        </p>
      )}
      <Canvas
        shadows
        // Pulled back and swung round to the working side: the table occupies
        // x 0.12..0.42 in front of the robot, so a camera tight on the torso
        // saw furniture rather than work.
          camera={{ position: [0.95, 0.85, 1.15], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* A studio backdrop, several shades darker than the page, so the
            robot's near-white covers actually have something to read against.
            Without it the model blows out and reads as a line sketch. */}
        <color attach="background" args={["#d9d9dd"]} />
        <fog attach="fog" args={["#d9d9dd", 3.2, 7]} />

        {/* Modest local lighting, deliberately no <Environment preset>: that
            fetches an HDR from a CDN, which stalls or fails offline — wrong
            for a robot control room that must work without internet. */}
        <hemisphereLight args={["#ffffff", "#9a9aa2", 0.55]} />
        <directionalLight
          position={[2.5, 4, 2]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.1}
          shadow-camera-far={10}
        />
        <directionalLight position={[-2.5, 2, -1.5]} intensity={0.35} />
        <directionalLight position={[0, 1.5, -3]} intensity={0.25} />
        {armSupported && (
          <ArmModel stateRef={jointStateRef} gripper={gripper} onError={() => setLoadFailed(true)} />
        )}
        {kinematics && <PrimitiveRobot stateRef={jointStateRef} kinematics={kinematics} />}
        <Workcell objectsRef={objectsRef} fixturesRef={fixturesRef} />
        <Grid
          args={[4, 4]}
          position={[0, 0, 0]}
          cellColor="#c2c2c8"
          sectionColor="#9a9aa2"
          cellSize={0.1}
          sectionSize={0.5}
          fadeDistance={4.5}
          infiniteGrid
        />
        <RenderAndTap />
        <FrameOnLoad
          fixturesRef={fixturesRef}
          frameKey={robot ? `${robot.platform}:${robot.name}` : "none"}
          reachM={reachM}
        />
      </Canvas>
    </div>
  );
}
