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
import { buildGeometry, type GeometrySpec } from "./geometry";
import {
  alignmentsFor,
  centerPoint,
  computeCenterPoint,
  controls,
  geometryOf,
  meshRegistry,
  motionOffset,
  publishCenter,
  roundTo,
  sceneRefs,
  SNAP,
  speedFactor,
  tapTarget,
  worldBoxOf,
  type DragPlaneMode,
  type Material,
  type PlacedObject,
  type ToolMode,
  type ViewMode,
} from "./state";

const MOVE_SPEED = 9;
const LOOK_SPEED = 2.4;
const LIFT_SPEED = 5;
const PITCH_LIMIT = Math.PI / 2 - 0.05;

/** First-person twin-stick rig. */
function FlyRig() {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(-0.18);
  const pos = useRef(new THREE.Vector3(0, 2.2, 9));
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  useEffect(() => {
    const canvas = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let pinchCenter = { x: 0, y: 0 };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        pinchCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 1) {
        yaw.current -= (event.clientX - previous.x) * 0.006;
        pitch.current = THREE.MathUtils.clamp(
          pitch.current - (event.clientY - previous.y) * 0.006,
          -PITCH_LIMIT,
          PITCH_LIMIT,
        );
        return;
      }

      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

      // Pinch out moves forward; a two-finger swipe pans the camera.
      pos.current.addScaledVector(forward, (distance - pinchDistance) * 0.012);
      pos.current.addScaledVector(right, -(center.x - pinchCenter.x) * 0.006);
      pos.current.addScaledVector(up, (center.y - pinchCenter.y) * 0.006);
      pinchDistance = distance;
      pinchCenter = center;
    };

    const onPointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchDistance = 0;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerEnd);
    canvas.addEventListener("pointercancel", onPointerEnd);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerEnd);
      canvas.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [camera, gl]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const k = speedFactor();
    const look = k * controls.lookMul;
    const move = k * controls.moveMul;
    yaw.current -= controls.look.x * LOOK_SPEED * look * dt;
    pitch.current = THREE.MathUtils.clamp(
      pitch.current - controls.look.y * LOOK_SPEED * look * dt,
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

    pos.current.addScaledVector(forward, -controls.move.y * MOVE_SPEED * move * dt);
    pos.current.addScaledVector(right, controls.move.x * MOVE_SPEED * move * dt);
    pos.current.y += controls.lift * LIFT_SPEED * k * controls.liftMul * dt;

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
  shapeSnap,
}: {
  depth: number;
  size: number;
  snap: boolean;
  grid: number;
  shapeSnap: boolean;
}) {
  const { camera, size: viewport } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const accum = useRef(0);

  useFrame((_, delta) => {
    sceneRefs.camera = camera;
    sceneRefs.width = viewport.width;
    sceneRefs.height = viewport.height;

    if (tapTarget.point) {
      centerPoint.copy(tapTarget.point);
      accum.current += delta;
      if (accum.current >= 1 / 30) {
        accum.current = 0;
        publishCenter({
          x: centerPoint.x,
          y: centerPoint.y,
          z: centerPoint.z,
          onSurface: true,
        });
      }
      return;
    }

    const { point, onSurface } = computeCenterPoint(camera, raycaster, {
      depth,
      size,
      snap,
      grid,
      shapeSnap,
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

function Ghost({
  spec,
  scale,
  material,
}: {
  spec: GeometrySpec;
  scale: [number, number, number];
  material: Material;
}) {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => buildGeometry(spec), [spec]);
  useFrame(() => {
    ref.current?.position.copy(centerPoint);
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo} scale={scale}>
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

export type CutPreview = {
  objectId: string;
  spec: GeometrySpec;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

/** Translucent red cutter sitting on the tapped face. */
function CutGhost({ preview }: { preview: CutPreview }) {
  const geo = useMemo(() => buildGeometry(preview.spec), [preview.spec]);
  return (
    <mesh
      geometry={geo}
      position={preview.position}
      rotation={preview.rotation}
      scale={preview.scale}
    >
      <meshBasicMaterial color="#ff6b6b" transparent opacity={0.4} depthTest={false} />
      <Edges color="#ff6b6b" />
    </mesh>
  );
}

function ObjectMesh({
  o,
  selected,
  tool,
  dragPlane,
  snap,
  grid,
  dragStep,
  playing,
  onSelect,
  onMove,
  onMeasurePick,
  onTapTarget,
  onCutPick,
}: {
  o: PlacedObject;
  selected: boolean;
  tool: ToolMode;
  dragPlane: DragPlaneMode;
  snap: boolean;
  grid: number;
  dragStep: number;
  playing: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, pos: [number, number, number]) => void;
  onMeasurePick: (p: THREE.Vector3) => void;
  onTapTarget: (p: THREE.Vector3, n: THREE.Vector3) => void;
  onCutPick: (id: string, p: THREE.Vector3, n: THREE.Vector3) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const dragging = useRef(false);
  const plane = useRef(new THREE.Plane());
  const offset = useRef(new THREE.Vector3());
  const hitPoint = useRef(new THREE.Vector3());
  const clock = useRef(0);

  const geometry = useMemo(() => geometryOf(o), [o]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    meshRegistry.set(o.id, mesh);
    return () => {
      meshRegistry.delete(o.id);
    };
  }, [o.id]);

  // Animated motion — display only, the stored position never changes.
  useFrame((_, delta) => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = o.motion;
    if (!m || m.mode === "off") {
      mesh.position.set(o.position[0], o.position[1], o.position[2]);
      return;
    }
    if (playing) clock.current += delta;
    const off = motionOffset(m, clock.current);
    mesh.position.set(
      o.position[0] + off.x,
      o.position[1] + off.y,
      o.position[2] + off.z,
    );
  });

  const stepped = (v: number, base: number) =>
    dragStep > 0 ? base + roundTo(v - base, dragStep) : v;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool === "measure") {
      e.stopPropagation();
      onMeasurePick(e.point.clone());
      return;
    }
    if (tool === "cut") {
      e.stopPropagation();
      const n = e.face
        ? e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);
      onCutPick(o.id, e.point.clone(), n);
      return;
    }
    if (tool === "place") {
      e.stopPropagation();
      const n = e.face
        ? e.face.normal.clone().transformDirection(e.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);
      onTapTarget(e.point.clone(), n);
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
    if (dragStep > 0) {
      onMove(o.id, [
        stepped(next.x, o.position[0]),
        stepped(next.y, o.position[1]),
        stepped(next.z, o.position[2]),
      ]);
      return;
    }
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
      geometry={geometry}
      position={o.position}
      rotation={o.rotation}
      scale={o.scale ?? [o.size, o.size, o.size]}
      castShadow
      receiveShadow
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <meshStandardMaterial
        color={o.color}
        metalness={o.metalness}
        roughness={o.roughness}
        side={THREE.DoubleSide}
      />
      {selected && <Edges scale={1.04} color="#4fd1ff" />}
    </mesh>
  );
}

/** Guide lines shown when the selection lines up with another object. */
function AlignGuides({
  objects,
  selectedIds,
  tol,
}: {
  objects: PlacedObject[];
  selectedIds: string[];
  tol: number;
}) {
  const guides = useMemo(() => {
    if (selectedIds.length !== 1) return [];
    const target = objects.find((o) => o.id === selectedIds[0]);
    if (!target) return [];
    const box = worldBoxOf(target);
    const others = objects
      .filter((o) => o.id !== target.id)
      .map((o) => ({ id: o.id, box: worldBoxOf(o) }));
    const hits = alignmentsFor(box, others, tol);
    const c = box.getCenter(new THREE.Vector3());
    const colors = ["#ff6b6b", "#8ce99a", "#4fd1ff"];
    return hits.slice(0, 6).map((h, i) => {
      const other = others.find((o) => o.id === h.otherId)!;
      const oc = other.box.getCenter(new THREE.Vector3());
      return {
        key: `${h.otherId}-${h.axis}-${i}`,
        color: colors[h.axis] as string,
        points: [c.clone(), oc.clone()] as [THREE.Vector3, THREE.Vector3],
      };
    });
  }, [objects, selectedIds, tol]);

  return (
    <>
      {guides.map((g) => (
        <Line
          key={g.key}
          points={g.points}
          color={g.color}
          lineWidth={1.5}
          dashed
          dashSize={0.2}
          gapSize={0.15}
          transparent
          opacity={0.9}
        />
      ))}
    </>
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

/** Small marker showing the sticky tap target. */
function TapMarker({ point }: { point: [number, number, number] | null }) {
  if (!point) return null;
  return (
    <mesh position={point}>
      <sphereGeometry args={[0.07, 12, 12]} />
      <meshBasicMaterial color="#4fd1ff" />
    </mesh>
  );
}

export type SceneProps = {
  objects: PlacedObject[];
  view: ViewMode;
  tool: ToolMode;
  ghostSpec: GeometrySpec;
  ghostScale: [number, number, number];
  size: number;
  depth: number;
  snap: boolean;
  shapeSnap: boolean;
  grid: number;
  dragStep: number;
  playing: boolean;
  showGuides: boolean;
  material: Material;
  dragPlane: DragPlaneMode;
  selectedIds: string[];
  measureA: [number, number, number] | null;
  measureB: [number, number, number] | null;
  tapPoint: [number, number, number] | null;
  cutPreview: CutPreview | null;
  onSelect: (id: string, additive: boolean) => void;
  onSelectNone: () => void;
  onMove: (id: string, pos: [number, number, number]) => void;
  onMeasurePick: (p: THREE.Vector3) => void;
  onTapTarget: (p: THREE.Vector3, n: THREE.Vector3) => void;
  onCutPick: (id: string, p: THREE.Vector3, n: THREE.Vector3) => void;
};

export function Scene(props: SceneProps) {
  const {
    objects,
    view,
    tool,
    ghostSpec,
    ghostScale,
    size,
    depth,
    snap,
    shapeSnap,
    grid,
    dragStep,
    playing,
    showGuides,
    material,
    dragPlane,
    selectedIds,
    measureA,
    measureB,
    tapPoint,
    cutPreview,
    onSelect,
    onSelectNone,
    onMove,
    onMeasurePick,
    onTapTarget,
    onCutPick,
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
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        />
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
          <MapControls
            makeDefault
            enableRotate={false}
            screenSpacePanning
            touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
          />
        </>
      )}

      <CenterProbe
        depth={depth}
        size={size}
        snap={snap}
        grid={grid}
        shapeSnap={shapeSnap}
      />

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

      {/* Ground catcher for deselect / measure / tap-target picks */}
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
          } else if (tool === "place") {
            e.stopPropagation();
            onTapTarget(e.point.clone(), new THREE.Vector3(0, 1, 0));
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
          dragStep={dragStep}
          playing={playing}
          onSelect={onSelect}
          onMove={onMove}
          onMeasurePick={onMeasurePick}
          onTapTarget={onTapTarget}
          onCutPick={onCutPick}
        />
      ))}

      {showGuides && tool === "edit" && (
        <AlignGuides
          objects={objects}
          selectedIds={selectedIds}
          tol={Math.max(0.005, grid * 0.25)}
        />
      )}

      {tool === "place" && (
        <Ghost spec={ghostSpec} scale={ghostScale} material={material} />
      )}
      {cutPreview && <CutGhost preview={cutPreview} />}
      <TapMarker point={tapPoint} />
      <MeasureOverlay a={measureA} b={measureB} />
    </>
  );
}
