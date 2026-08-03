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
import { Environment, Grid, OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Box3,
  type LoadingManager,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from "three";
import URDFLoader, { type URDFRobot } from "urdf-loader";

import type { JointState } from "@/lib/robot/protocol";
import { useRobot } from "@/components/app/robot-provider";

const ROOT = "/robots/openarm_v1";
const PACKAGES = { openarm_description: ROOT };
const URDF = `${ROOT}/v1.urdf`;
const GRIPPER_TRAVEL_M = 0.044;

/** 0° is rest (jaws together, the URDF finger zero); -65° is fully open.
 *  Mirrors the runtime's SimRobot mapping exactly. */
function gripperDegToMeters(deg: number): number {
  return (-deg / 65) * GRIPPER_TRAVEL_M;
}

function ArmModel({ stateRef }: { stateRef: React.RefObject<JointState | null> }) {
  const [robot, setRobot] = useState<URDFRobot | null>(null);

  useEffect(() => {
    const gltf = new GLTFLoader();
    const loader = new URDFLoader();
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
      loaded.traverse((child: Object3D) => {
        if (child instanceof Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const material = child.material as MeshStandardMaterial;
          if (material) {
            // GLB materials come in flat-lit; give them a little spec so the
            // machined surfaces read as hardware rather than cardboard.
            material.metalness = 0.25;
            material.roughness = 0.55;
          }
        }
      });
      loaded.rotation.x = -Math.PI / 2; // URDF is Z-up; three.js is Y-up

      // Sit the robot on the grid regardless of where its origin sits.
      const box = new Box3().setFromObject(loaded);
      loaded.position.y -= box.min.y;
      setRobot(loaded);
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
            gripperDegToMeters(deg),
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

/** Frames the arm once it exists, so the camera never starts pointing at air. */
function FrameOnLoad() {
  return (
    <OrbitControls
      target={new Vector3(0, 0.42, 0)}
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
  const { jointStateRef } = useRobot(); // read OUTSIDE the R3F Canvas boundary

  return (
    <div ref={containerRef} className="h-full w-full">
      <Canvas
        shadows
        camera={{ position: [0.85, 0.75, 0.95], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[2.5, 4, 2]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.1}
          shadow-camera-far={10}
        />
        <directionalLight position={[-2, 2, -1.5]} intensity={0.4} />
        <Environment preset="city" />
        <ArmModel stateRef={jointStateRef} />
        <Grid
          args={[4, 4]}
          position={[0, 0, 0]}
          cellColor="#d4d4d8"
          sectionColor="#a1a1aa"
          cellSize={0.1}
          sectionSize={0.5}
          fadeDistance={4}
          infiniteGrid
        />
        <FrameOnLoad />
      </Canvas>
    </div>
  );
}
