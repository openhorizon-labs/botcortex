"use client";

/**
 * The simulation viewport — the OpenArm posed live from the runtime's ~15 Hz
 * joint-state stream. Renders the official URDF's collision meshes (2.4 MB,
 * tier-1 per the research ticket); the meshopt-GLB pretty pass swaps in later
 * without touching this data flow.
 *
 * Import this via next/dynamic({ ssr: false }) only — three.js has no
 * server-side story, and urdf-loader itself must be imported statically
 * (dynamic-importing that module hangs the dev server: vercel/next.js#66591).
 */

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { LoadingManager, MathUtils, Mesh, MeshStandardMaterial } from "three";
import URDFLoader, { type URDFRobot } from "urdf-loader";

import type { JointState } from "@/lib/robot/protocol";
import { useRobot } from "@/components/app/robot-provider";

const PACKAGES = { openarm_description: "/robots/openarm_v1" };
const URDF = "/robots/openarm_v1/v1.urdf";

/** Runtime speaks gripper degrees (-65 closed … 0 open); URDF fingers are
 *  prismatic meters (0 … 0.044). Same mapping as the runtime's SimRobot. */
function gripperDegToMeters(deg: number): number {
  return ((deg + 65) / 65) * 0.044;
}

/** React context does NOT cross the R3F Canvas boundary (separate reconciler)
 *  — the joint-state ref comes in as a prop from outside instead. */
function ArmModel({ stateRef }: { stateRef: React.RefObject<JointState | null> }) {
  const [robot, setRobot] = useState<URDFRobot | null>(null);

  useEffect(() => {
    const manager = new LoadingManager();
    manager.onError = (url) => console.error("[sim] failed to load", url);
    const loader = new URDFLoader(manager);
    loader.packages = PACKAGES;
    loader.parseVisual = false;
    loader.parseCollision = true;
    loader.load(URDF, (loaded) => {
      const material = new MeshStandardMaterial({
        color: "#3f3f46",
        roughness: 0.55,
        metalness: 0.35,
      });
      loaded.traverse((child) => {
        // urdf-loader hides collision geometry by default — it's our tier-1 visual
        if ((child as unknown as { isURDFCollider?: boolean }).isURDFCollider) {
          child.visible = true;
        }
        if (child instanceof Mesh) {
          child.material = material;
          child.castShadow = true;
        }
      });
      loaded.rotation.x = -Math.PI / 2; // URDF is Z-up; three.js is Y-up
      setRobot(loaded);
    });
  }, []);

  useFrame(() => {
    const state = stateRef.current;
    if (!robot || !state) return;
    for (const [arm, joints] of Object.entries(state)) {
      for (const [joint, deg] of Object.entries(joints)) {
        if (joint === "gripper") {
          const meters = gripperDegToMeters(deg);
          robot.setJointValue(`openarm_${arm}_finger_joint1`, meters);
          robot.setJointValue(`openarm_${arm}_finger_joint2`, meters);
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

export default function SimView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { jointStateRef } = useRobot(); // read OUTSIDE the Canvas boundary
  return (
    <div ref={containerRef} className="h-full w-full">
      <Canvas
        shadows
        camera={{ position: [1.1, 0.9, 1.1], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight
          position={[3, 4, 2]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <ArmModel stateRef={jointStateRef} />
        <Grid
          args={[4, 4]}
          position={[0, -0.01, 0]}
          cellColor="#d4d4d8"
          sectionColor="#a1a1aa"
          cellSize={0.1}
          sectionSize={0.5}
          fadeDistance={3.5}
          infiniteGrid
        />
        <OrbitControls
          target={[0, 0.45, 0]}
          enablePan={false}
          minDistance={0.6}
          maxDistance={3}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}
