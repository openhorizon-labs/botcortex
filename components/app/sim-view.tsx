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
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Box3,
  BoxGeometry,
  Color,
  DoubleSide,
  type Group,
  LoadingManager,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from "three";
import URDFLoader, { type URDFRobot } from "urdf-loader";

import type { JointState, SceneBodies } from "@/lib/robot/protocol";
import { useRobot } from "@/components/app/robot-provider";

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
 * The workcell: table, trays, blocks.
 *
 * Boxes, posed straight from the robot's own report — position, orientation,
 * size and colour all come down the wire, so nothing here decides what a scene
 * contains or what colour a "red block" is. Before this the viewer drew an arm
 * alone in a void while the simulation it was mirroring had a table with three
 * blocks on it, which made every manipulation task impossible to follow.
 */
function Workcell({
  objectsRef,
  fixturesRef,
}: {
  objectsRef: React.RefObject<SceneBodies | null>;
  fixturesRef: React.RefObject<SceneBodies | null>;
}) {
  const group = useRef<Group>(null);
  const drawn = useRef<Map<string, Mesh>>(new Map());

  useFrame(() => {
    if (!group.current) return;
    const bodies = { ...(fixturesRef.current ?? {}), ...(objectsRef.current ?? {}) };
    for (const [name, body] of Object.entries(bodies)) {
      let mesh = drawn.current.get(name);
      if (!mesh) {
        // Built on first sight rather than from a fixed list: a platform with
        // a different workcell needs no change here.
        mesh = new Mesh(
          new BoxGeometry(...body.size_m),
          new MeshStandardMaterial({
            color: new Color(body.colour[0], body.colour[1], body.colour[2]),
            roughness: 0.75,
            metalness: 0.02,
          }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        drawn.current.set(name, mesh);
        group.current.add(mesh);
      }
      mesh.position.set(...body.position);
      // MuJoCo quaternions are wxyz; three.js wants xyzw.
      const [w, x, y, z] = body.orientation;
      mesh.quaternion.set(x, y, z, w);
    }
  });

  // Z-up in, Y-up out — the same -90 degrees about x the arm gets. Doing it on
  // the GROUP rather than per box means positions, sizes and quaternions all
  // stay exactly as the robot reported them: MuJoCo's (x, y, z) with z up.
  // Converting each mesh by hand is how the table came out 1.1 m TALL, because
  // BoxGeometry reads its second argument as height.
  return <group ref={group} rotation={[-Math.PI / 2, 0, 0]} />;
}

function ArmModel({
  stateRef,
  gripper,
}: {
  stateRef: React.RefObject<JointState | null>;
  gripper: GripperMap;
}) {
  const [robot, setRobot] = useState<URDFRobot | null>(null);

  useEffect(() => {
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
          done(null, err as Error);
        },
      );
    };
    loader.loadMeshCb = loadMesh as unknown as typeof loader.loadMeshCb;

    loader.load(URDF, (loaded) => {
      loaded.rotation.x = -Math.PI / 2; // URDF is Z-up; three.js is Y-up

      manager.onLoad = () => {
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
    });
  }, []);

  useFrame(() => {
    const state = stateRef.current;
    if (!robot || !state) return;
    for (const [arm, joints] of Object.entries(state)) {
      for (const [joint, deg] of Object.entries(joints)) {
        if (joint === "gripper") {
          // finger_joint2 mimics finger_joint1 — urdf-loader applies it for us.
          robot.setJointValue(
            `openarm_${arm}_finger_joint1`,
            gripperDegToMeters(deg, gripper),
          );
        } else {
          robot.setJointValue(
            `openarm_${arm}_joint${joint.slice(1)}`,
            MathUtils.degToRad(deg),
          );
        }
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
function FrameOnLoad() {
  return (
    <OrbitControls
      target={new Vector3(0, 0.30, 0.22)}
      enablePan={false}
      minDistance={0.5}
      maxDistance={3}
      maxPolarAngle={Math.PI / 2.05}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

export default function SimView() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Read OUTSIDE the R3F Canvas boundary — the scene is its own React root.
  const { jointStateRef, objectsRef, fixturesRef, robot } = useRobot();
  const gripper = robot?.gripper ?? ASSUMED_GRIPPER;

  return (
    <div ref={containerRef} className="h-full w-full">
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
        <ArmModel stateRef={jointStateRef} gripper={gripper} />
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
        <FrameOnLoad />
      </Canvas>
    </div>
  );
}
