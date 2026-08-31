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

export type MotionMode = "off" | "linear" | "oscillate" | "orbit";

/** Animated motion attached to an object; never changes its stored position. */
export type MotionSpec = {
  mode: MotionMode;
  /** 0 = X, 1 = Y, 2 = Z — travel axis, or orbit axis for "orbit". */
  axis: 0 | 1 | 2;
  /** Travel distance in metres, or orbit radius. */
  distance: number;
  /** Metres per second (or radians per second for orbit). */
  speed: number;
  /** 0 = constant speed, 1 = fully eased accelerate/decelerate. */
  accel: number;
  /** Seconds paused at each end of a leg. */
  pause: number;
};

export const DEFAULT_MOTION: MotionSpec = {
  mode: "off",
  axis: 0,
  distance: 2,
  speed: 1,
  accel: 0.5,
  pause: 0.5,
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
  motion: MotionSpec | null;
  color: string;
  metalness: number;
  roughness: number;
  groupId: string | null;
};

/** Animated offset for a motion spec at time `t` seconds. */
export function motionOffset(m: MotionSpec, t: number): THREE.Vector3 {
  const out = new THREE.Vector3();
  if (!m || m.mode === "off") return out;
  const speed = Math.max(0.0001, m.speed);

  if (m.mode === "orbit") {
    const a = t * speed;
    const r = m.distance;
    if (m.axis === 1) out.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    else if (m.axis === 0) out.set(0, Math.cos(a) * r, Math.sin(a) * r);
    else out.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    return out;
  }

  const travel = Math.max(0.0001, m.distance / speed);
  const leg = travel + Math.max(0, m.pause);
  const pingpong = m.mode === "oscillate";
  const cycle = pingpong ? leg * 2 : leg;
  const phase = ((t % cycle) + cycle) % cycle;

  let u: number;
  if (phase < travel) u = phase / travel;
  else if (phase < leg) u = 1;
  else {
    const back = phase - leg;
    u = pingpong ? (back < travel ? 1 - back / travel : 0) : 0;
  }

  // Acceleration curve: blend linear with smoothstep.
  const eased = u * u * (3 - 2 * u);
  const k = THREE.MathUtils.clamp(m.accel, 0, 1);
  const d = (u * (1 - k) + eased * k) * m.distance;

  if (m.axis === 0) out.x = d;
  else if (m.axis === 1) out.y = d;
  else out.z = d;
  return out;
}


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
  /** Global joystick speed multiplier (0.05 – 3). */
  speed: 1,
  /** Per-channel trims. */
  moveMul: 1,
  lookMul: 1,
  liftMul: 1,
  /** Precision crawl toggle and the speed it jumps to. */
  precision: false,
  precisionLevel: 0.2,
};

export function speedFactor() {
  return controls.precision ? controls.precisionLevel : controls.speed;
}


/** Live world-space position of the screen-center placement point. */
export const centerPoint = new THREE.Vector3();

/** Sticky tap target — when set, placement uses this instead of screen center. */
export const tapTarget: {
  point: THREE.Vector3 | null;
  normal: THREE.Vector3 | null;
  objectId: string | null;
} = { point: null, normal: null, objectId: null };

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
 * Half extent of an axis-aligned box along an arbitrary direction — the
 * distance from its center to the surface in that direction.
 */
export function halfExtentAlong(half: THREE.Vector3, n: THREE.Vector3) {
  return (
    Math.abs(n.x) * half.x + Math.abs(n.y) * half.y + Math.abs(n.z) * half.z
  );
}

/**
 * Resolve the world point under the screen center.
 *
 * Priority when snapping is on: shape snap point -> object face -> ground
 * plane -> free depth. A face hit offsets by the placed shape's true half
 * extent along the face normal, so it rests exactly on the surface instead of
 * sinking halfway in.
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
    /** Half extent of the pending shape along a direction (defaults to size/2). */
    halfFor?: (n: THREE.Vector3) => number;
  },
): { point: THREE.Vector3; onSurface: boolean; snapped: boolean } {
  const grid = opts.grid ?? SNAP;
  const halfFor = opts.halfFor ?? (() => opts.size / 2);
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
      const off = halfFor(_normal);

      if (opts.shapeSnap !== false) {
        const near = nearestSnapPoint(hit.point, Math.max(0.4, opts.size * 0.75));
        if (near) {
          return {
            point: near.clone().addScaledVector(_normal, off),
            onSurface: true,
            snapped: true,
          };
        }
      }

      _point.copy(hit.point).addScaledVector(_normal, off);

      // Round only across the face; never along the normal, so contact stays flush.
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
          halfFor(new THREE.Vector3(0, 1, 0)),
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
    motion: null,

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
    motion: null,

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
    const next = evaluateBoolean(
      geo,
      baseMatrix,
      toolGeo,
      matrixOf(op.position, op.rotation, op.scale),
      op.op,
    );
    // A failed / empty result is skipped so the object never vanishes.
    if (next) geo = next;
  }
  _m.identity();
  return geo;
}

/** World-space bounding box of an object (base shape, ignoring cuts). */
export function worldBoxOf(o: PlacedObject): THREE.Box3 {
  const geo = buildGeometry(specOf(o));
  if (!geo.boundingBox) geo.computeBoundingBox();
  return geo
    .boundingBox!.clone()
    .applyMatrix4(matrixOf(o.position, o.rotation, o.scale ?? [o.size, o.size, o.size]));
}

/** True when two boxes share volume (a shared face alone does not count). */
export function boxesOverlap(a: THREE.Box3, b: THREE.Box3, eps = 1e-4) {
  return (
    a.min.x < b.max.x - eps &&
    a.max.x > b.min.x + eps &&
    a.min.y < b.max.y - eps &&
    a.max.y > b.min.y + eps &&
    a.min.z < b.max.z - eps &&
    a.max.z > b.min.z + eps
  );
}

export type AlignHit = { axis: 0 | 1 | 2; value: number; otherId: string };

/**
 * Axes on which `box` lines up with another object's box — matching centers,
 * min edges or max edges within `tol`.
 */
export function alignmentsFor(
  box: THREE.Box3,
  others: { id: string; box: THREE.Box3 }[],
  tol: number,
): AlignHit[] {
  const out: AlignHit[] = [];
  const keys = ["x", "y", "z"] as const;
  const c = box.getCenter(new THREE.Vector3());
  for (const other of others) {
    const oc = other.box.getCenter(new THREE.Vector3());
    keys.forEach((k, axis) => {
      const pairs: [number, number][] = [
        [c[k], oc[k]],
        [box.min[k], other.box.min[k]],
        [box.max[k], other.box.max[k]],
        [box.min[k], other.box.max[k]],
        [box.max[k], other.box.min[k]],
      ];
      for (const [a, b] of pairs) {
        if (Math.abs(a - b) <= tol) {
          out.push({ axis: axis as 0 | 1 | 2, value: b, otherId: other.id });
          return;
        }
      }
    });
  }
  return out;
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

// ---------------------------------------------------------------------------
// Precision / focus helpers
// ---------------------------------------------------------------------------

/** Latest selection centroid the fly rig can glide to (double-tap / Focus). */
export const selectionFocusState = {
  valid: false,
  point: new THREE.Vector3(),
};

/** Focus request published by the HUD, consumed by the fly rig each frame. */
export const flyFocus = { nonce: 0, point: new THREE.Vector3() };

export function requestFlyFocus(p: THREE.Vector3) {
  flyFocus.point.copy(p);
  flyFocus.nonce++;
}

/**
 * Magnetic alignment: returns corrected center coordinates for axes where the
 * box nearly lines up with another box (center match, flush edge, or butt
 * joint). Used to softly snap drags into perfect alignment.
 */
export function magneticAlign(
  box: THREE.Box3,
  others: { id: string; box: THREE.Box3 }[],
  tol: number,
): Partial<Record<"x" | "y" | "z", number>> {
  const out: Partial<Record<"x" | "y" | "z", number>> = {};
  const keys = ["x", "y", "z"] as const;
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  for (const k of keys) {
    const h = s[k] / 2;
    let best: number | null = null;
    let bestD = tol;
    for (const other of others) {
      const oc = other.box.getCenter(new THREE.Vector3());
      const candidates = [
        oc[k],
        other.box.min[k] + h,
        other.box.max[k] - h,
        other.box.max[k] + h,
        other.box.min[k] - h,
      ];
      for (const cand of candidates) {
        const d = Math.abs(cand - c[k]);
        if (d <= bestD) {
          bestD = d;
          best = cand;
        }
      }
    }
    if (best !== null && Math.abs(best - c[k]) > 1e-6) out[k] = best;
  }
  return out;
}

function overlaps1d(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
  eps: number,
) {
  return aMin < bMax - eps && aMax > bMin + eps;
}

/**
 * Solid-body move: given a box and a desired delta, return the delta that is
 * actually allowed so the box never passes through any of `others`. Each axis
 * is resolved separately, so a blocked object slides along the surface it hit
 * instead of stopping dead.
 */
export function resolveMove(
  box: THREE.Box3,
  delta: THREE.Vector3,
  others: THREE.Box3[],
  eps = 1e-4,
): THREE.Vector3 {
  const cur = box.clone();
  const out = new THREE.Vector3();
  const axes = ["x", "y", "z"] as const;
  for (const k of axes) {
    const d = delta[k];
    if (!d) continue;
    const o1 = k === "x" ? "y" : "x";
    const o2 = k === "z" ? "y" : "z";
    let allowed = d;
    for (const ob of others) {
      if (!overlaps1d(cur.min[o1], cur.max[o1], ob.min[o1], ob.max[o1], eps)) continue;
      if (!overlaps1d(cur.min[o2], cur.max[o2], ob.min[o2], ob.max[o2], eps)) continue;
      if (d > 0) {
        const gap = ob.min[k] - cur.max[k];
        if (gap >= -eps) allowed = Math.min(allowed, Math.max(0, gap - eps));
      } else {
        const gap = ob.max[k] - cur.min[k];
        if (gap <= eps) allowed = Math.max(allowed, Math.min(0, gap + eps));
      }
    }
    out[k] = allowed;
    cur.min[k] += allowed;
    cur.max[k] += allowed;
  }
  return out;
}

