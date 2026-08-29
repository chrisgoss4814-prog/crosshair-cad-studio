import { useFrame, useThree } from "@react-three/fiber";
import { Grid, Environment, Lightformer } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { controls, crosshair, type PlacedObject } from "./state";

const MOVE_SPEED = 6;
const LOOK_SPEED = 1.9;
const LIFT_SPEED = 4;

function Rig({ depth, onReadout }: { depth: number; onReadout: (v: THREE.Vector3) => void }) {
  const { camera } = useThree();
  const pos = useRef(new THREE.Vector3(7, 5, 9));
  const yaw = useRef(Math.atan2(7, 9));
  const pitch = useRef(-Math.atan2(5, Math.hypot(7, 9)));
  const acc = useRef(0);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);

    yaw.current -= controls.look.x * LOOK_SPEED * dt;
    pitch.current = THREE.MathUtils.clamp(
      pitch.current - controls.look.y * LOOK_SPEED * dt,
      -Math.PI / 2 + 0.05,
      Math.PI / 2 - 0.05,
    );

    const sin = Math.sin(yaw.current);
    const cos = Math.cos(yaw.current);
    const fwd = -controls.move.y * MOVE_SPEED * dt;
    const strafe = controls.move.x * MOVE_SPEED * dt;
    pos.current.x += -sin * fwd + cos * strafe;
    pos.current.z += -cos * fwd - sin * strafe;
    pos.current.y += controls.lift * LIFT_SPEED * dt;

    camera.position.copy(pos.current);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");

    const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    crosshair.copy(camera.position).addScaledVector(dir, depth);

    acc.current += dt;
    if (acc.current > 0.08) {
      acc.current = 0;
      onReadout(crosshair.clone());
    }
  });

  return null;
}

function Ghost({ depth, kind, size }: { depth: number; kind: string; size: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.position.copy(crosshair);
  });
  return (
    <group ref={ref}>
      <mesh>
        <Geometry kind={kind} size={size} />
        <meshBasicMaterial color="#4fd1ff" wireframe transparent opacity={0.85} />
      </mesh>
      {/* drop line to the ground plane */}
      <Plumb depth={depth} />
    </group>
  );
}

function Plumb({ depth: _depth }: { depth: number }) {
  const ref = useRef<THREE.Line>(null);
  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -1, 0),
  ]), []);
  useFrame(() => {
    if (ref.current) ref.current.scale.y = Math.max(0.001, crosshair.y);
  });
  return (
    // @ts-expect-error three line primitive
    <line ref={ref} geometry={geom}>
      <lineBasicMaterial color="#4fd1ff" transparent opacity={0.4} />
    </line>
  );
}

function Geometry({ kind, size }: { kind: string; size: number }) {
  switch (kind) {
    case "sphere":
      return <sphereGeometry args={[size / 2, 32, 24]} />;
    case "cylinder":
      return <cylinderGeometry args={[size / 2, size / 2, size, 32]} />;
    case "cone":
      return <coneGeometry args={[size / 2, size, 32]} />;
    default:
      return <boxGeometry args={[size, size, size]} />;
  }
}

export function Scene({
  objects,
  depth,
  kind,
  size,
  selectedId,
  onReadout,
}: {
  objects: PlacedObject[];
  depth: number;
  kind: string;
  size: number;
  selectedId: string | null;
  onReadout: (v: THREE.Vector3) => void;
}) {
  return (
    <>
      <color attach="background" args={["#0a1018"]} />
      <fog attach="fog" args={["#0a1018", 26, 90]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 14, 6]} intensity={1.4} castShadow />
      <Environment>
        <Lightformer intensity={1.6} position={[0, 6, 0]} scale={[12, 12, 1]} />
        <Lightformer intensity={0.8} color="#5fb8ff" position={[-8, 2, -2]} rotation-y={Math.PI / 2} scale={[20, 3, 1]} />
      </Environment>

      <Rig depth={depth} onReadout={onReadout} />

      <Grid
        args={[80, 80]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1d3550"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#2f6d99"
        fadeDistance={70}
        fadeStrength={1.5}
        infiniteGrid
      />

      <Axes />

      {objects.map((o) => (
        <mesh key={o.id} position={o.position} castShadow receiveShadow>
          <Geometry kind={o.kind} size={o.size} />
          <meshStandardMaterial
            color={o.id === selectedId ? "#ffb454" : "#8fa7bd"}
            metalness={0.25}
            roughness={0.45}
          />
        </mesh>
      ))}

      <Ghost depth={depth} kind={kind} size={size} />
    </>
  );
}

function Axis({ dir, color }: { dir: [number, number, number]; color: string }) {
  const geom = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...dir).multiplyScalar(-40),
        new THREE.Vector3(...dir).multiplyScalar(40),
      ]),
    [dir],
  );
  return (
    // @ts-expect-error three line primitive
    <line geometry={geom}>
      <lineBasicMaterial color={color} />
    </line>
  );
}

function Axes() {
  return (
    <group>
      <Axis dir={[1, 0, 0]} color="#ff6b6b" />
      <Axis dir={[0, 1, 0]} color="#8ce99a" />
      <Axis dir={[0, 0, 1]} color="#74c0fc" />
    </group>
  );
}
