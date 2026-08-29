import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Edges,
  Environment,
  Grid,
  Html,
  Lightformer,
  Line,
  MapControls,
  OrbitControls,
  OrthographicCamera,
} from "@react-three/drei";
import * as THREE from "three";
import {
  centerPoint,
  computeCenterPoint,
  controls,
  meshRegistry,
  publishCenter,
  roundTo,
  sceneRefs,
  SNAP,
  type DragPlaneMode,
  type Material,
  type PlacedObject,
  type ShapeKind,
  type ToolMode,
  type ViewMode,
} from "./state";

const MOVE_SPEED = 7;
const LOOK_SPEED = 1.9;
const LIFT_SPEED = 4;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

function Geometry({ kind, size }: { kind: ShapeKind; size: number }) {
  switch (kind) {
    case "sphere":
      return <sphereGeometry args={[size / 2, 28, 20]} />;
    case "cylinder":
      return <cylinderGeometry args={[size / 2, size / 2, size, 28]} />;
    case "cone":
      return <coneGeometry args={[size / 2, size, 28]} />;
    default:
      return <boxGeometry args={[size, size, size]} />;
  }
}

/** First-person twin-stick rig. */
function FlyRig() {
  const { camera } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(-0.18);
  const pos = useRef(new THREE.Vector3(0, 2.2, 9));
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    yaw.current -= controls.look.x * LOOK_SPEED * dt;
    pitch.current = THREE.MathUtils.clamp(
      pitch.current - controls.look.y * LOOK_SPEED * dt,
      -PITCH_LIMIT,
      PITCH_LIMIT,
    );

    const forward = new THREE.Vector3(
      -Math.sin(yaw.current),
      0,
      -Math.cos(yaw.current),
    );
    const right = new THREE.Vector3(
      Math.cos(yaw.current),
      0,
      -Math.sin(yaw.current),
    );

    pos.current.addScaledVector(forward, -controls.move.y * MOVE_SPEED * dt);
    pos.current.addScaledVector(right, controls.move.x * MOVE_SPEED * dt);
    pos.current.y += controls.lift * LIFT_SPEED * dt;

    euler.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(euler);
    camera.position.copy(pos.current);
  });

  return null;
}

/** Resolves the world point under the screen center every frame. */
function CenterProbe({
  depth,
  size,
  snap,
  grid,
}: {
  depth: number;
  size: number;
  snap: boolean;
  grid: number;
}) {
  const { camera, size: viewport } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const accum = useRef(0);

  useFrame((_, delta) => {
    sceneRefs.camera = camera;
    sceneRefs.width = viewport.width;
    sceneRefs.height = viewport.height;

    const { point, onSurface } = computeCenterPoint(camera, raycaster, {
      depth,
      size,
      snap,
      grid,
    });
    centerPoint.copy(point);

    accum.current += delta;
    if (accum.current >= 1 / 30) {
      accum.current = 0;
      publishCenter({
        x: point.x,
        y: point.y,
        z: point.z,
        onSurface,
      });
    }
  });

  return null;
}

function Ghost({ kind, size, material }: { kind: ShapeKind; size: number; material: Material }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.position.copy(centerPoint);
  });
  return (
    <group ref={ref}>
      <mesh>
        <Geometry kind={kind} size={size} />
        <meshBasicMaterial
          color={material.color}
          wireframe
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  );
}

function ObjectMesh({
  o,
  selected,
  tool,
  dragPlane,
  snap,
  grid,
  onSelect,
  onMove,
  onMeasurePick,
}: {
  o: PlacedObject;
  selected: boolean;
  tool: ToolMode;
  dragPlane: DragPlaneMode;
  snap: boolean;
  grid: number;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, pos: [number, number, number]) => void;
  onMeasurePick: (p: THREE.Vector3) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const dragging = useRef(false);
  const plane = useRef(new THREE.Plane());
  const offset = useRef(new THREE.Vector3());
  const hitPoint = useRef(new THREE.Vector3());

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    meshRegistry.set(o.id, mesh);
    return () => {
      meshRegistry.delete(o.id);
    };
  }, [o.id]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool === "measure") {
      e.stopPropagation();
      onMeasurePick(e.point.clone());
      return;
    }
    if (tool !== "edit") return;
    e.stopPropagation();
    onSelect(o.id, e.nativeEvent.shiftKey);
    (e.target as Element)?.setPointerCapture?.(e.pointerId);

    const objPos = new THREE.Vector3(...o.position);
    if (dragPlane === "horizontal") {
      plane.current.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(0, 1, 0),
        objPos,
      );
    } else {
      const n = new THREE.Vector3();
      camera.getWorldDirection(n);
      plane.current.setFromNormalAndCoplanarPoint(n.negate(), objPos);
    }
    if (e.ray.intersectPlane(plane.current, hitPoint.current)) {
      offset.current.copy(objPos).sub(hitPoint.current);
    } else {
      offset.current.set(0, 0, 0);
    }
    dragging.current = true;
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    e.stopPropagation();
    if (!e.ray.intersectPlane(plane.current, hitPoint.current)) return;
    const next = hitPoint.current.clone().add(offset.current);
    onMove(
      o.id,
      snap
        ? [roundTo(next.x, grid), roundTo(next.y, grid), roundTo(next.z, grid)]
        : [next.x, next.y, next.z],
    );
  };

  const endDrag = () => {
    dragging.current = false;
  };

  return (
    <mesh
      ref={ref}
      position={o.position}
      rotation={o.rotation}
      castShadow
      receiveShadow
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <Geometry kind={o.kind} size={o.size} />
      <meshStandardMaterial
        color={o.color}
        metalness={o.metalness}
        roughness={o.roughness}
      />
      {selected && <Edges scale={1.04} color="#4fd1ff" />}
    </mesh>
  );
}

function MeasureOverlay({
  a,
  b,
}: {
  a: [number, number, number] | null;
  b: [number, number, number] | null;
}) {
  if (!a) return null;
  const pa = new THREE.Vector3(...a);
  const pb = b ? new THREE.Vector3(...b) : null;
  const mid = pb ? pa.clone().lerp(pb, 0.5) : pa;
  return (
    <group>
      <mesh position={pa}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#ffb454" />
      </mesh>
      {pb && (
        <>
          <mesh position={pb}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshBasicMaterial color="#ffb454" />
          </mesh>
          <Line points={[pa, pb]} color="#ffb454" lineWidth={2} dashed={false} />
          <Html position={mid} center distanceFactor={12}>
            <div className="whitespace-nowrap rounded border border-grid-line bg-panel/90 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              {pa.distanceTo(pb).toFixed(3)} m
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

export type SceneProps = {
  objects: PlacedObject[];
  view: ViewMode;
  tool: ToolMode;
  kind: ShapeKind;
  size: number;
  depth: number;
  snap: boolean;
  grid: number;
  material: Material;
  dragPlane: DragPlaneMode;
  selectedIds: string[];
  measureA: [number, number, number] | null;
  measureB: [number, number, number] | null;
  onSelect: (id: string, additive: boolean) => void;
  onSelectNone: () => void;
  onMove: (id: string, pos: [number, number, number]) => void;
  onMeasurePick: (p: THREE.Vector3) => void;
};

export function Scene(props: SceneProps) {
  const {
    objects,
    view,
    tool,
    kind,
    size,
    depth,
    snap,
    grid,
    material,
    dragPlane,
    selectedIds,
    measureA,
    measureB,
    onSelect,
    onSelectNone,
    onMove,
    onMeasurePick,
  } = props;

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <>
      <color attach="background" args={["#0d1420"]} />
      <fog attach="fog" args={["#0d1420", 40, 160]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#8fc7ff", "#1a2130", 0.5]} />
      <directionalLight
        position={[14, 20, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <Environment>
        <Lightformer intensity={1.6} position={[0, 6, 0]} scale={[12, 12, 1]} />
        <Lightformer
          intensity={0.9}
          color="#7fb8d8"
          position={[-6, 2, -2]}
          rotation-y={Math.PI / 2}
          scale={[24, 2, 1]}
        />
      </Environment>

      {view === "fly" && <FlyRig />}
      {view === "orbit" && (
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
      )}
      {view === "top" && (
        <>
          <OrthographicCamera
            makeDefault
            position={[0, 60, 0.001]}
            zoom={40}
            near={0.1}
            far={500}
          />
          <MapControls makeDefault enableRotate={false} screenSpacePanning />
        </>
      )}

      <CenterProbe depth={depth} size={size} snap={snap} grid={grid} />

      <Grid
        args={[400, 400]}
        cellSize={SNAP}
        cellThickness={0.5}
        cellColor="#26364d"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#38506e"
        fadeDistance={110}
        fadeStrength={1.4}
        infiniteGrid
        followCamera={false}
      />

      {/* World orientation axes */}
      <Line points={[[-200, 0, 0], [200, 0, 0]]} color="#ff6b6b" lineWidth={1} transparent opacity={0.55} />
      <Line points={[[0, -60, 0], [0, 200, 0]]} color="#8ce99a" lineWidth={1} transparent opacity={0.55} />
      <Line points={[[0, 0, -200], [0, 0, 200]]} color="#4fd1ff" lineWidth={1} transparent opacity={0.55} />

      {/* Ground catcher for deselect / measure picks */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0, 0]}
        receiveShadow
        onPointerDown={(e) => {
          if (tool === "measure") {
            e.stopPropagation();
            onMeasurePick(e.point.clone());
          } else if (tool === "edit") {
            onSelectNone();
          }
        }}
      >
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial
          color="#111a27"
          roughness={0.95}
          metalness={0.05}
          transparent
          opacity={0.85}
        />
      </mesh>

      {objects.map((o) => (
        <ObjectMesh
          key={o.id}
          o={o}
          selected={selected.has(o.id)}
          tool={tool}
          dragPlane={dragPlane}
          snap={snap}
          grid={grid}
          onSelect={onSelect}
          onMove={onMove}
          onMeasurePick={onMeasurePick}
        />
      ))}

      {tool === "place" && <Ghost kind={kind} size={size} material={material} />}
      <MeasureOverlay a={measureA} b={measureB} />
    </>
  );
}
