import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { centerPoint, nearestSnapPoint } from "./state";
import {
  isCurved,
  publishSketchLabel,
  resolveSketchPoint,
  sampleSegment,
  segmentCount,
  sketchCursor,
  sketchGeometry,
  v,
  type Sketch,
  type SketchSnapPrefs,
  type Vec3,
} from "./sketch";

const POINT_COLOR = "#ffb454";
const HANDLE_COLOR = "#4fd1ff";

/**
 * Resolves where the next sketch point would land: the screen-center point,
 * pulled onto the nearest enabled snap candidate.
 */
function SketchCursor({
  sketches,
  draft,
  prefs,
  grid,
  tol,
}: {
  sketches: Sketch[];
  draft: Sketch | null;
  prefs: SketchSnapPrefs;
  grid: number;
  tol: number;
}) {
  useFrame(() => {
    const { point, label } = resolveSketchPoint(centerPoint, {
      sketches,
      draft,
      prefs,
      grid,
      tol,
      objectSnap: (p, t) => nearestSnapPoint(p, t),
    });
    sketchCursor.point.copy(point);
    publishSketchLabel(label);
  });
  return null;
}


/** Rubber band from the last placed point to the live cursor. */
function DraftPreview({ draft }: { draft: Sketch }) {
  const ref = useRef<THREE.Object3D & { geometry: { setPositions: (a: number[]) => void } }>(
    null,
  );
  const dot = useRef<THREE.Mesh>(null);
  const last = draft.points[draft.points.length - 1];
  useFrame(() => {
    const c = sketchCursor.point;
    dot.current?.position.copy(c);
    if (ref.current && last) {
      ref.current.geometry.setPositions([last[0], last[1], last[2], c.x, c.y, c.z]);
    }
  });
  return (
    <group>
      <mesh ref={dot}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color={HANDLE_COLOR} depthTest={false} />
      </mesh>
      {last && (
        <Line
          // @ts-expect-error drei Line ref is a Line2 with a positions buffer
          ref={ref}
          points={[
            [last[0], last[1], last[2]],
            [last[0], last[1], last[2]],
          ]}
          color={HANDLE_COLOR}
          lineWidth={1.6}
          dashed
          dashSize={0.12}
          gapSize={0.1}
          depthTest={false}
        />
      )}
    </group>
  );
}

function DragDot({
  position,
  color,
  radius,
  normal,
  onDrag,
}: {
  position: THREE.Vector3;
  color: string;
  radius: number;
  normal: THREE.Vector3;
  onDrag: (p: Vec3) => void;
}) {
  const dragging = useRef(false);
  const plane = useRef(new THREE.Plane());
  const hit = useRef(new THREE.Vector3());
  const { camera } = useThree();

  return (
    <mesh
      position={position}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        (e.target as Element)?.setPointerCapture?.(e.pointerId);
        // Drag inside the sketch plane; fall back to the screen plane when the
        // sketch plane is nearly edge-on to the camera.
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const n =
          Math.abs(camDir.dot(normal)) < 0.15 ? camDir.clone().negate() : normal.clone();
        plane.current.setFromNormalAndCoplanarPoint(n, position);
        dragging.current = true;
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging.current) return;
        e.stopPropagation();
        if (!e.ray.intersectPlane(plane.current, hit.current)) return;
        onDrag([hit.current.x, hit.current.y, hit.current.z]);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <sphereGeometry args={[radius, 12, 12]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  );
}

function SketchView({
  s,
  selected,
  selectedSeg,
  editable,
  onPickSegment,
  onMovePoint,
  onMoveHandle,
}: {
  s: Sketch;
  selected: boolean;
  selectedSeg: number | null;
  editable: boolean;
  onPickSegment: (id: string, seg: number) => void;
  onMovePoint: (id: string, index: number, p: Vec3) => void;
  onMoveHandle: (id: string, seg: number, which: "h1" | "h2", p: Vec3) => void;
}) {
  const normal = useMemo(() => v(s.normal).normalize(), [s.normal]);
  const count = segmentCount(s);
  const face = useMemo(() => sketchGeometry(s), [s]);

  const spans = useMemo(() => {
    const out: { i: number; pts: THREE.Vector3[] }[] = [];
    for (let i = 0; i < count; i++) {
      const pts = sampleSegment(s, i);
      if (pts.length >= 2) out.push({ i, pts });
    }
    return out;
  }, [s, count]);

  return (
    <group>
      {face && (
        <mesh geometry={face}>
          <meshStandardMaterial
            color={s.color}
            metalness={0.2}
            roughness={0.6}
            transparent={s.extrude <= 0}
            opacity={s.extrude > 0 ? 1 : 0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {spans.map(({ i, pts }) => (
        <Line
          key={i}
          points={pts}
          color={selected && selectedSeg === i ? HANDLE_COLOR : s.color}
          lineWidth={selected && selectedSeg === i ? 3.5 : 2}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPickSegment(s.id, i);
          }}
        />
      ))}

      {selected &&
        s.points.map((p, i) =>
          editable ? (
            <DragDot
              key={`p${i}`}
              position={v(p)}
              color={POINT_COLOR}
              radius={0.07}
              normal={normal}
              onDrag={(np) => onMovePoint(s.id, i, np)}
            />
          ) : null,
        )}

      {selected &&
        selectedSeg !== null &&
        isCurved(s.segments[selectedSeg]) && (
          <group>
            {(["h1", "h2"] as const).map((which) => {
              const h = s.segments[selectedSeg]![which]!;
              const anchorIndex =
                which === "h1" ? selectedSeg : (selectedSeg + 1) % s.points.length;
              const anchor = s.points[anchorIndex];
              return (
                <group key={which}>
                  {anchor && (
                    <Line
                      points={[
                        [anchor[0], anchor[1], anchor[2]],
                        [h[0], h[1], h[2]],
                      ]}
                      color={HANDLE_COLOR}
                      lineWidth={1}
                      dashed
                      dashSize={0.08}
                      gapSize={0.08}
                    />
                  )}
                  <DragDot
                    position={v(h)}
                    color={HANDLE_COLOR}
                    radius={0.06}
                    normal={normal}
                    onDrag={(np) => onMoveHandle(s.id, selectedSeg, which, np)}
                  />
                </group>
              );
            })}
          </group>
        )}
    </group>
  );
}

export type SketchLayerProps = {
  sketches: Sketch[];
  draft: Sketch | null;
  drawing: boolean;
  selectedId: string | null;
  selectedSeg: number | null;
  prefs: SketchSnapPrefs;
  grid: number;
  onPickSegment: (id: string, seg: number) => void;
  onMovePoint: (id: string, index: number, p: Vec3) => void;
  onMoveHandle: (id: string, seg: number, which: "h1" | "h2", p: Vec3) => void;
};

export function SketchLayer({
  sketches,
  draft,
  drawing,
  selectedId,
  selectedSeg,
  prefs,
  grid,
  onPickSegment,
  onMovePoint,
  onMoveHandle,
}: SketchLayerProps) {
  const tol = Math.max(0.15, grid * 1.2);
  return (
    <group>
      {drawing && (
        <>
          <SketchCursor
            sketches={sketches}
            draft={draft}
            prefs={prefs}
            grid={grid}
            tol={tol}
          />
          <CursorDot />
        </>
      )}
      {sketches.map((s) => (
        <SketchView
          key={s.id}
          s={s}
          selected={s.id === selectedId}
          selectedSeg={s.id === selectedId ? selectedSeg : null}
          editable
          onPickSegment={onPickSegment}
          onMovePoint={onMovePoint}
          onMoveHandle={onMoveHandle}
        />
      ))}
      {draft && (
        <>
          <SketchView
            s={draft}
            selected
            selectedSeg={null}
            editable={false}
            onPickSegment={onPickSegment}
            onMovePoint={onMovePoint}
            onMoveHandle={onMoveHandle}
          />
          <DraftPreview draft={draft} />
        </>
      )}
    </group>
  );
}
