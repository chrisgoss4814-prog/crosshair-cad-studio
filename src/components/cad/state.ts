import * as THREE from "three";

export type ShapeKind = "box" | "sphere" | "cylinder" | "cone";
export type ViewMode = "fly" | "orbit" | "top";
export type ToolMode = "place" | "edit" | "measure";
export type DragPlaneMode = "horizontal" | "facing";

export type Material = {
  color: string;
  metalness: number;
  roughness: number;
};

export type PlacedObject = {
  id: string;
  kind: ShapeKind;
  position: [number, number, number];
  rotation: [number, number, number];
  size: number;
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
};

/** Live world-space position of the screen-center placement point. */
export const centerPoint = new THREE.Vector3();

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
 * Resolve the world point under the screen center.
 *
 * Priority when snapping is on: object face -> ground plane -> free depth.
 * A face hit offsets by half the placement size along the face normal so
 * cylinders stack into pillars and boxes butt flush into brick courses.
 */
export function computeCenterPoint(
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  opts: { depth: number; size: number; snap: boolean; grid?: number },
): { point: THREE.Vector3; onSurface: boolean } {
  const grid = opts.grid ?? SNAP;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const meshes = Array.from(meshRegistry.values());
  if (opts.snap && meshes.length) {
    const hits = raycaster.intersectObjects(meshes, false);
    const hit = hits[0];
    if (hit && hit.face) {
      _normal
        .copy(hit.face.normal)
        .transformDirection(hit.object.matrixWorld)
        .normalize();
      _point.copy(hit.point).addScaledVector(_normal, opts.size / 2);

      // Snap only the axes perpendicular to the contact normal so the
      // stacked face stays perfectly flush.
      const ax = Math.abs(_normal.x);
      const ay = Math.abs(_normal.y);
      const az = Math.abs(_normal.z);
      if (ax < 0.8) _point.x = roundTo(_point.x, grid);
      if (ay < 0.8) _point.y = roundTo(_point.y, grid);
      if (az < 0.8) _point.z = roundTo(_point.z, grid);

      return { point: _point.clone(), onSurface: true };
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
  return { point: _point.clone(), onSurface: false };
}

// ---------------------------------------------------------------------------
// Object helpers
// ---------------------------------------------------------------------------

export function makeObject(
  kind: ShapeKind,
  position: [number, number, number],
  size: number,
  material: Material,
): PlacedObject {
  return {
    id: crypto.randomUUID(),
    kind,
    position,
    rotation: [0, 0, 0],
    size,
    color: material.color,
    metalness: material.metalness,
    roughness: material.roughness,
    groupId: null,
  };
}

export function cloneObject(o: PlacedObject, offset = 0): PlacedObject {
  return {
    ...o,
    id: crypto.randomUUID(),
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
