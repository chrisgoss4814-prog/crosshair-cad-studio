import * as THREE from "three";
import {
  buildGeometry,
  evaluateBoolean,
  is2D,
  type BooleanOp,
  type GeometrySpec,
  type Shape2D,
  type ShapeKind,
} from "./geometry";

export type { ShapeKind, Shape2D } from "./geometry";
export { is2D, SHAPES_2D, SHAPES_3D } from "./geometry";

export type ViewMode = "fly" | "orbit" | "top";
export type ToolMode = "place" | "edit" | "measure" | "cut";
export type DragPlaneMode = "horizontal" | "facing";

export type Material = {
  color: string;
  metalness: number;
  roughness: number;
};

/** A boolean operation baked into an object, kept editable/undoable. */
export type CutOp = {
  id: string;
  op: BooleanOp;
  kind: ShapeKind;
  sides: number;
  curve: number;
  extrude: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type PlacedObject = {
  id: string;
  kind: ShapeKind;
  position: [number, number, number];
  rotation: [number, number, number];
  /** Per-axis dimensions in metres (stretch). */
  scale: [number, number, number];
  /** Legacy uniform size, kept for older saved scenes. */
  size: number;
  sides: number;
  curve: number;
  /** Extrude height for 2D profiles; 0 keeps them flat. */
  extrude: number;
  bend: number;
  bendAxis: 0 | 1 | 2;
  taper: number;
  profile: Shape2D | null;
  ops: CutOp[];
  color: string;
  metalness: number;
  roughness: number;
  groupId: string | null;
};

export const DEFAULT_MATERIAL: Material = {
  color: "#8fa7bd",
  metalness: 0.25,
  roughness: 0.45,
};

export const SWATCHES = [
  "#8fa7bd",
  "#ffb454",
  "#4fd1ff",
  "#8ce99a",
  "#ff6b6b",
  "#c9a0dc",
];

/** Per-frame control state, mutated by the joysticks, read inside useFrame. */
export const controls = {
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  lift: 0,
  /** Global joystick speed multiplier (0.05 – 2). */
  speed: 1,
  /** Precision crawl toggle. */
  precision: false,
};

export function speedFactor() {
  return controls.speed * (controls.precision ? 0.15 : 1);
}

/** Live world-space position of the screen-center placement point. */
export const centerPoint = new THREE.Vector3();

/** Sticky tap target — when set, placement uses this instead of screen center. */
export const tapTarget: {
  point: THREE.Vector3 | null;
  normal: THREE.Vector3 | null;
} = { point: null, normal: null };

/** Registry of live placed meshes so the probe can raycast against them. */
export const meshRegistry = new Map<string, THREE.Mesh>();

/** Shared handles to the live camera / viewport for screen-space math. */
export const sceneRefs: {
  camera: THREE.Camera | null;
  width: number;
  height: number;
} = { camera: null, width: 1, height: 1 };

// ---------------------------------------------------------------------------
// Center-point external store (HUD subscribes, canvas publishes)
// ---------------------------------------------------------------------------

export type CenterSnapshot = {
  x: number;
  y: number;
  z: number;
  onSurface: boolean;
};

let snapshot: CenterSnapshot = { x: 0, y: 0, z: 0, onSurface: false };
const listeners = new Set<() => void>();

export function publishCenter(next: CenterSnapshot) {
  if (
    next.x === snapshot.x &&
    next.y === snapshot.y &&
    next.z === snapshot.z &&
    next.onSurface === snapshot.onSurface
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((l) => l());
}

export function subscribeCenter(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCenterSnapshot() {
  return snapshot;
}

// ---------------------------------------------------------------------------
// Snapping helpers
// ---------------------------------------------------------------------------

export const SNAP = 0.5;
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function roundTo(value: number, grid: number) {
  return Math.round(value / grid) * grid;
}

export function snapVec(v: THREE.Vector3, snap: boolean, grid = SNAP) {
  if (!snap) return [v.x, v.y, v.z] as [number, number, number];
  return [roundTo(v.x, grid), roundTo(v.y, grid), roundTo(v.z, grid)] as [
    number,
    number,
    number,
  ];
}

const _normal = new THREE.Vector3();
const _point = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * Snap candidates for an object: corners, edge midpoints, face centers and the
 * center itself, in world space, derived from its geometry bounds.
 */
export function snapPointsFor(mesh: THREE.Mesh): THREE.Vector3[] {
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const xs = [bb.min.x, (bb.min.x + bb.max.x) / 2, bb.max.x];
  const ys = [bb.min.y, (bb.min.y + bb.max.y) / 2, bb.max.y];
  const zs = [bb.min.z, (bb.min.z + bb.max.z) / 2, bb.max.z];
  const out: THREE.Vector3[] = [];
  mesh.updateMatrixWorld();
  for (const x of xs)
    for (const y of ys)
      for (const z of zs)
        out.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
  return out;
}

/**
 * Nearest shape-to-shape snap candidate to a world point, within `tol`.
 */
export function nearestSnapPoint(
  target: THREE.Vector3,
  tol: number,
  excludeId?: string,
): THREE.Vector3 | null {
  let best: THREE.Vector3 | null = null;
  let bestD = tol;
  meshRegistry.forEach((mesh, id) => {
    if (id === excludeId) return;
    if (mesh.position.distanceTo(target) > tol + 12) return;
    for (const p of snapPointsFor(mesh)) {
      const d = p.distanceTo(target);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  });
  return best;
}

/**
 * Resolve the world point under the screen center.
 *
 * Priority when snapping is on: shape snap point -> object face -> ground
 * plane -> free depth. A face hit offsets by half the placement size along the
 * face normal so cylinders stack into pillars and boxes butt flush.
 */
export function computeCenterPoint(
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  opts: {
    depth: number;
    size: number;
    snap: boolean;
    grid?: number;
    shapeSnap?: boolean;
  },
): { point: THREE.Vector3; onSurface: boolean; snapped: boolean } {
  const grid = opts.grid ?? SNAP;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const meshes = Array.from(meshRegistry.values());
  if (opts.snap && meshes.length) {
    const hits = raycaster.intersectObjects(meshes, false);
    const hit = hits[0];
    if (hit && hit.face) {
      if (opts.shapeSnap !== false) {
        const near = nearestSnapPoint(hit.point, Math.max(0.4, opts.size * 0.75));
        if (near) {
          _normal
            .copy(hit.face.normal)
            .transformDirection(hit.object.matrixWorld)
            .normalize();
          return {
            point: near.clone().addScaledVector(_normal, opts.size / 2),
            onSurface: true,
            snapped: true,
          };
        }
      }

      _normal
        .copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld)
        .normalize();
      _point.copy(hit.point).addScaledVector(_normal, opts.size / 2);

      const ax = Math.abs(_normal.x);
      const ay = Math.abs(_normal.y);
      const az = Math.abs(_normal.z);
      if (ax < 0.8) _point.x = roundTo(_point.x, grid);
      if (ay < 0.8) _point.y = roundTo(_point.y, grid);
      if (az < 0.8) _point.z = roundTo(_point.z, grid);

      return { point: _point.clone(), onSurface: true, snapped: false };
    }
  }

  if (opts.snap && raycaster.ray.intersectPlane(GROUND, _point)) {
    const dist = raycaster.ray.origin.distanceTo(_point);
    if (dist <= 200) {
      return {
        point: new THREE.Vector3(
          roundTo(_point.x, grid),
          opts.size / 2,
          roundTo(_point.z, grid),
        ),
        onSurface: false,
        snapped: false,
      };
    }
  }

  camera.getWorldDirection(_dir);
  _point.copy(camera.position).addScaledVector(_dir, opts.depth);
  if (opts.snap) {
    _point.set(
      roundTo(_point.x, grid),
      roundTo(_point.y, grid),
      roundTo(_point.z, grid),
    );
  }
  return { point: _point.clone(), onSurface: false, snapped: false };
}

// ---------------------------------------------------------------------------
// Object helpers
// ---------------------------------------------------------------------------

export function makeObject(
  kind: ShapeKind,
  position: [number, number, number],
  size: number,
  material: Material,
  extra: Partial<PlacedObject> = {},
): PlacedObject {
  return {
    id: crypto.randomUUID(),
    kind,
    position,
    rotation: [0, 0, 0],
    scale: [size, size, size],
    size,
    sides: 6,
    curve: 0,
    extrude: is2D(kind) ? 0 : 0,
    bend: 0,
    bendAxis: 1,
    taper: 0,
    profile: null,
    ops: [],
    color: material.color,
    metalness: material.metalness,
    roughness: material.roughness,
    groupId: null,
    ...extra,
  };
}

/** Fills in defaults for objects loaded from older saved scenes. */
export function hydrateObject(o: Partial<PlacedObject> & { id: string }): PlacedObject {
  const size = o.size ?? 1;
  return {
    rotation: [0, 0, 0],
    position: [0, 0, 0],
    kind: "box",
    scale: [size, size, size],
    size,
    sides: 6,
    curve: 0,
    extrude: 0,
    bend: 0,
    bendAxis: 1,
    taper: 0,
    profile: null,
    ops: [],
    color: DEFAULT_MATERIAL.color,
    metalness: DEFAULT_MATERIAL.metalness,
    roughness: DEFAULT_MATERIAL.roughness,
    groupId: null,
    ...o,
  } as PlacedObject;
}

export function specOf(o: PlacedObject): GeometrySpec {
  return {
    kind: o.kind,
    sides: o.sides ?? 6,
    curve: o.curve ?? 0,
    extrude: o.extrude ?? 0,
    bend: o.bend ?? 0,
    bendAxis: o.bendAxis ?? 1,
    taper: o.taper ?? 0,
    profile: o.profile ?? null,
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export function matrixOf(
  position: [number, number, number],
  rotation: [number, number, number],
  scale: [number, number, number],
) {
  _e.set(rotation[0], rotation[1], rotation[2]);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    _q,
    new THREE.Vector3(...scale),
  );
}

/** Final geometry for an object, with all boolean ops evaluated. */
export function geometryOf(o: PlacedObject): THREE.BufferGeometry {
  let geo = buildGeometry(specOf(o));
  const ops = o.ops ?? [];
  if (!ops.length) return geo;

  const baseMatrix = matrixOf(o.position, o.rotation, o.scale);
  for (const op of ops) {
    const toolGeo = buildGeometry({
      kind: op.kind,
      sides: op.sides,
      curve: op.curve,
      extrude: op.extrude,
      bend: 0,
      bendAxis: 1,
      taper: 0,
      profile: null,
    });
    geo = evaluateBoolean(
      geo,
      baseMatrix,
      toolGeo,
      matrixOf(op.position, op.rotation, op.scale),
      op.op,
    );
  }
  _m.identity();
  return geo;
}

export function cloneObject(o: PlacedObject, offset = 0): PlacedObject {
  return {
    ...o,
    id: crypto.randomUUID(),
    ops: (o.ops ?? []).map((op) => ({ ...op, id: crypto.randomUUID() })),
    position: [o.position[0] + offset, o.position[1], o.position[2] + offset],
  };
}

export function centroid(objects: PlacedObject[]) {
  const c = new THREE.Vector3();
  if (!objects.length) return c;
  objects.forEach((o) => c.add(new THREE.Vector3(...o.position)));
  return c.divideScalar(objects.length);
}

export const STEPS = [0.001, 0.01, 0.1, 1, 10];

/** Tick spacing for the axis ruler, derived from the active nudge step. */
export function tickUnitFor(step: number) {
  if (step <= 0.001) return 0.01;
  if (step <= 0.01) return 0.1;
  if (step <= 0.1) return 0.5;
  if (step <= 1) return 1;
  return 10;
}
