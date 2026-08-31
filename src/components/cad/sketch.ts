import * as THREE from "three";

/**
 * Sketch layer: chains of line segments drawn on a plane. Any segment can be
 * curved with two bezier handles, ends snap onto each other and onto solids,
 * and a closed chain can be filled into a face (and extruded into a solid).
 */

export type Vec3 = [number, number, number];

/** One span between two points. Straight when both handles are null. */
export type SketchSegment = {
  h1: Vec3 | null;
  h2: Vec3 | null;
};

export type Sketch = {
  id: string;
  points: Vec3[];
  /** One per span: points.length - 1 open, points.length closed. */
  segments: SketchSegment[];
  closed: boolean;
  /** Closed loops can render as a filled face. */
  filled: boolean;
  /** Height of the solid built from a filled loop; 0 keeps it flat. */
  extrude: number;
  color: string;
  /** Plane the sketch was drawn on. */
  normal: Vec3;
};

export const SKETCH_COLOR = "#ffb454";

export function makeSketch(first: Vec3, normal: Vec3 = [0, 1, 0]): Sketch {
  return {
    id: crypto.randomUUID(),
    points: [first],
    segments: [],
    closed: false,
    filled: false,
    extrude: 0,
    color: SKETCH_COLOR,
    normal,
  };
}

export function hydrateSketch(s: Partial<Sketch> & { id?: string }): Sketch {
  const points = (s.points ?? []) as Vec3[];
  const closed = !!s.closed;
  const want = Math.max(0, closed ? points.length : points.length - 1);
  const segments: SketchSegment[] = [];
  for (let i = 0; i < want; i++) {
    const seg = s.segments?.[i];
    segments.push({ h1: seg?.h1 ?? null, h2: seg?.h2 ?? null });
  }
  return {
    id: s.id ?? crypto.randomUUID(),
    points,
    segments,
    closed,
    filled: !!s.filled,
    extrude: s.extrude ?? 0,
    color: s.color ?? SKETCH_COLOR,
    normal: (s.normal ?? [0, 1, 0]) as Vec3,
  };
}

export function v(p: Vec3) {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

export function tuple(p: THREE.Vector3): Vec3 {
  return [p.x, p.y, p.z];
}

export function segmentCount(s: Sketch) {
  if (s.points.length < 2) return 0;
  return s.closed ? s.points.length : s.points.length - 1;
}

export function segmentEnds(s: Sketch, i: number): [THREE.Vector3, THREE.Vector3] | null {
  const a = s.points[i];
  const b = s.points[(i + 1) % s.points.length];
  if (!a || !b) return null;
  return [v(a), v(b)];
}

/** Default bezier handles: one third along the straight span. */
export function defaultHandles(a: THREE.Vector3, b: THREE.Vector3): [Vec3, Vec3] {
  const d = b.clone().sub(a).multiplyScalar(1 / 3);
  return [tuple(a.clone().add(d)), tuple(b.clone().sub(d))];
}

export function isCurved(seg: SketchSegment | undefined) {
  return !!(seg && seg.h1 && seg.h2);
}

/** Points along one span — 2 for a line, a sampled arc for a curve. */
export function sampleSegment(
  s: Sketch,
  i: number,
  steps = 28,
): THREE.Vector3[] {
  const ends = segmentEnds(s, i);
  if (!ends) return [];
  const [a, b] = ends;
  const seg = s.segments[i];
  if (!isCurved(seg)) return [a, b];
  const curve = new THREE.CubicBezierCurve3(a, v(seg!.h1!), v(seg!.h2!), b);
  return curve.getPoints(steps);
}

/** Full polyline for the sketch, in world space. */
export function sketchPolyline(s: Sketch): THREE.Vector3[] {
  const n = segmentCount(s);
  if (!n) return s.points.map(v);
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const pts = sampleSegment(s, i);
    if (i > 0) pts.shift();
    out.push(...pts);
  }
  return out;
}

export function sketchLength(s: Sketch) {
  const pts = sketchPolyline(s);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += pts[i]!.distanceTo(pts[i - 1]!);
  return total;
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

export type SnapKind = "endpoint" | "midpoint" | "on-line";

export type SnapHit = { point: THREE.Vector3; kind: SnapKind; label: string };

export type SketchSnapOptions = {
  endpoints: boolean;
  midpoints: boolean;
  /** Ignore this sketch's own point at this index (the one being dragged). */
  ignore?: { id: string; index: number } | null;
};

function nearestOnPolyline(pts: THREE.Vector3[], target: THREE.Vector3) {
  let best: THREE.Vector3 | null = null;
  let bestD = Infinity;
  const ab = new THREE.Vector3();
  const ap = new THREE.Vector3();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    ab.copy(b).sub(a);
    const len2 = ab.lengthSq();
    if (len2 < 1e-12) continue;
    ap.copy(target).sub(a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / len2, 0, 1);
    const p = a.clone().addScaledVector(ab, t);
    const d = p.distanceTo(target);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { point: best, distance: bestD } : null;
}

/** Closest sketch snap candidate to `target` within `tol`. */
export function nearestSketchSnap(
  sketches: Sketch[],
  target: THREE.Vector3,
  tol: number,
  opts: SketchSnapOptions,
): SnapHit | null {
  let best: SnapHit | null = null;
  let bestD = tol;

  const consider = (point: THREE.Vector3, kind: SnapKind, label: string) => {
    const d = point.distanceTo(target);
    if (d < bestD) {
      bestD = d;
      best = { point: point.clone(), kind, label };
    }
  };

  for (const s of sketches) {
    if (opts.endpoints) {
      s.points.forEach((p, i) => {
        if (opts.ignore && opts.ignore.id === s.id && opts.ignore.index === i) return;
        consider(v(p), "endpoint", "endpoint");
      });
    }
    if (opts.midpoints) {
      const count = segmentCount(s);
      for (let i = 0; i < count; i++) {
        const pts = sampleSegment(s, i);
        if (pts.length < 2) continue;
        const mid = pts[Math.floor(pts.length / 2)]!;
        consider(mid, "midpoint", "midpoint");
        const near = nearestOnPolyline(pts, target);
        if (near && near.distance < bestD) {
          bestD = near.distance;
          best = { point: near.point.clone(), kind: "on-line", label: "on line" };
        }
      }
    }
  }
  return best;
}

/**
 * Lock the direction from `from` to `p` to the nearest multiple of `stepDeg`,
 * measured inside the sketch plane, keeping the same length.
 */
export function angleLock(
  from: THREE.Vector3,
  p: THREE.Vector3,
  normal: THREE.Vector3,
  stepDeg = 15,
): THREE.Vector3 {
  const d = p.clone().sub(from);
  const len = d.length();
  if (len < 1e-6) return p.clone();
  const n = normal.clone().normalize();
  // Flatten onto the plane, then rotate to the closest allowed angle.
  d.addScaledVector(n, -d.dot(n));
  if (d.lengthSq() < 1e-12) return p.clone();
  const u = planeBasisU(n);
  const w = n.clone().cross(u).normalize();
  const a = Math.atan2(d.dot(w), d.dot(u));
  const stepRad = (stepDeg * Math.PI) / 180;
  const snapped = Math.round(a / stepRad) * stepRad;
  const flat = d.length();
  return from
    .clone()
    .addScaledVector(u, Math.cos(snapped) * flat)
    .addScaledVector(w, Math.sin(snapped) * flat)
    .addScaledVector(n, p.clone().sub(from).dot(n));
}

// ---------------------------------------------------------------------------
// Plane basis + fill geometry
// ---------------------------------------------------------------------------

export function planeBasisU(n: THREE.Vector3) {
  const ref =
    Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(ref, n).normalize();
}

export function planeMatrix(origin: THREE.Vector3, normal: THREE.Vector3) {
  const n = normal.clone().normalize();
  const u = planeBasisU(n);
  const w = new THREE.Vector3().crossVectors(n, u).normalize();
  return new THREE.Matrix4().makeBasis(u, w, n).setPosition(origin);
}

/**
 * Filled face (or solid, when `extrude` is set) for a closed sketch, in world
 * space. Returns null when the sketch cannot form a face.
 */
export function sketchGeometry(s: Sketch): THREE.BufferGeometry | null {
  if (!s.closed || !s.filled || s.points.length < 3) return null;
  const origin = v(s.points[0]!);
  const m = planeMatrix(origin, v(s.normal));
  const inv = m.clone().invert();

  const to2 = (p: THREE.Vector3) => {
    const q = p.clone().applyMatrix4(inv);
    return new THREE.Vector2(q.x, q.y);
  };

  const shape = new THREE.Shape();
  const count = segmentCount(s);
  const start = to2(v(s.points[0]!));
  shape.moveTo(start.x, start.y);
  for (let i = 0; i < count; i++) {
    const ends = segmentEnds(s, i);
    if (!ends) continue;
    const b = to2(ends[1]);
    const seg = s.segments[i];
    if (isCurved(seg)) {
      const c1 = to2(v(seg!.h1!));
      const c2 = to2(v(seg!.h2!));
      shape.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
    } else {
      shape.lineTo(b.x, b.y);
    }
  }
  shape.closePath();

  let geo: THREE.BufferGeometry;
  try {
    if (s.extrude > 0) {
      geo = new THREE.ExtrudeGeometry(shape, {
        depth: s.extrude,
        bevelEnabled: false,
        curveSegments: 24,
      });
    } else {
      geo = new THREE.ShapeGeometry(shape, 24);
    }
  } catch {
    return null;
  }
  geo.applyMatrix4(m);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

export function cloneSketch(s: Sketch, offset = 0.5): Sketch {
  const shift = (p: Vec3): Vec3 => [p[0] + offset, p[1], p[2] + offset];
  return {
    ...s,
    id: crypto.randomUUID(),
    points: s.points.map(shift),
    segments: s.segments.map((seg) => ({
      h1: seg.h1 ? shift(seg.h1) : null,
      h2: seg.h2 ? shift(seg.h2) : null,
    })),
  };
}

export function translateSketch(s: Sketch, d: Vec3): Sketch {
  const shift = (p: Vec3): Vec3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  return {
    ...s,
    points: s.points.map(shift),
    segments: s.segments.map((seg) => ({
      h1: seg.h1 ? shift(seg.h1) : null,
      h2: seg.h2 ? shift(seg.h2) : null,
    })),
  };
}

/** Move one point and drag its touching handles along with it. */
export function movePoint(s: Sketch, index: number, to: Vec3): Sketch {
  const from = s.points[index];
  if (!from) return s;
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const shift = (p: Vec3 | null): Vec3 | null =>
    p ? [p[0] + d[0], p[1] + d[1], p[2] + d[2]] : null;
  const n = s.points.length;
  const prevSeg = s.closed ? (index - 1 + n) % n : index - 1;
  return {
    ...s,
    points: s.points.map((p, i) => (i === index ? to : p)),
    segments: s.segments.map((seg, i) => {
      if (i === index) return { ...seg, h1: shift(seg.h1) };
      if (i === prevSeg) return { ...seg, h2: shift(seg.h2) };
      return seg;
    }),
  };
}

/**
 * Mirror the opposite handle across a shared point so joined curves stay
 * smooth. `which` names the handle that just moved.
 */
export function mirrorHandle(
  s: Sketch,
  segIndex: number,
  which: "h1" | "h2",
): Sketch {
  const n = s.points.length;
  const count = segmentCount(s);
  const seg = s.segments[segIndex];
  if (!seg) return s;
  const segments = s.segments.map((x) => ({ ...x }));

  if (which === "h1") {
    // Shared point is the start of this segment = end of the previous one.
    const prev = s.closed ? (segIndex - 1 + n) % n : segIndex - 1;
    const p = s.points[segIndex];
    const other = segments[prev];
    if (prev >= 0 && prev < count && other && other.h2 && p && seg.h1) {
      const anchor = v(p);
      const dir = anchor.clone().sub(v(seg.h1));
      const len = v(other.h2).distanceTo(anchor);
      other.h2 = tuple(anchor.clone().addScaledVector(dir.normalize(), len));
    }
  } else {
    const next = s.closed ? (segIndex + 1) % n : segIndex + 1;
    const p = s.points[(segIndex + 1) % n];
    const other = segments[next];
    if (next >= 0 && next < count && other && other.h1 && p && seg.h2) {
      const anchor = v(p);
      const dir = anchor.clone().sub(v(seg.h2));
      const len = v(other.h1).distanceTo(anchor);
      other.h1 = tuple(anchor.clone().addScaledVector(dir.normalize(), len));
    }
  }
  return { ...s, segments };
}

// ---------------------------------------------------------------------------
// Live drawing cursor (published by the scene, read by the HUD)
// ---------------------------------------------------------------------------

export type SketchSnapPrefs = {
  endpoints: boolean;
  midpoints: boolean;
  objects: boolean;
  gridAngle: boolean;
};

export const DEFAULT_SKETCH_SNAP: SketchSnapPrefs = {
  endpoints: true,
  midpoints: true,
  objects: true,
  gridAngle: true,
};

/** Where the next sketch point would land, and which snap is holding it. */
export const sketchCursor = {
  point: new THREE.Vector3(),
  label: null as string | null,
};

const cursorListeners = new Set<() => void>();
let cursorLabel: string | null = null;

export function publishSketchLabel(label: string | null) {
  if (label === cursorLabel) return;
  cursorLabel = label;
  sketchCursor.label = label;
  cursorListeners.forEach((l) => l());
}

export function subscribeSketchLabel(l: () => void) {
  cursorListeners.add(l);
  return () => {
    cursorListeners.delete(l);
  };
}

export function getSketchLabel() {
  return cursorLabel;
}

// ---------------------------------------------------------------------------
// Snap resolution shared by the live cursor and direct taps
// ---------------------------------------------------------------------------

/**
 * Pull a raw world point onto the nearest enabled snap candidate: sketch
 * endpoints and midpoints first, then solid snap points, with grid + 15°
 * angle lock as the fallback.
 */
export function resolveSketchPoint(
  raw: THREE.Vector3,
  opts: {
    sketches: Sketch[];
    draft: Sketch | null;
    prefs: SketchSnapPrefs;
    grid: number;
    tol: number;
    /** Solid-object snap lookup, injected to keep this module standalone. */
    objectSnap?: (p: THREE.Vector3, tol: number) => THREE.Vector3 | null;
    ignore?: { id: string; index: number } | null;
  },
): { point: THREE.Vector3; label: string | null } {
  const { sketches, draft, prefs, grid, tol } = opts;
  const p = raw.clone();
  let label: string | null = null;

  if (prefs.gridAngle) {
    const last = draft?.points[draft.points.length - 1];
    if (last) {
      const from = v(last);
      const locked = angleLock(from, p, v(draft!.normal), 15);
      if (locked.distanceTo(p) < tol) {
        p.copy(locked);
        const d = locked.clone().sub(from);
        const deg = Math.round((Math.atan2(d.z, d.x) * 180) / Math.PI / 15) * 15;
        label = `${((deg % 360) + 360) % 360}°`;
      } else {
        p.set(round(p.x, grid), round(p.y, grid), round(p.z, grid));
      }
    } else {
      p.set(round(p.x, grid), round(p.y, grid), round(p.z, grid));
    }
  }

  const all = draft ? [...sketches, draft] : sketches;
  const hit = nearestSketchSnap(all, p, tol, {
    endpoints: prefs.endpoints,
    midpoints: prefs.midpoints,
    ignore: opts.ignore ?? null,
  });
  if (hit) return { point: hit.point, label: hit.label };

  if (prefs.objects && opts.objectSnap) {
    const solid = opts.objectSnap(p, tol);
    if (solid) return { point: solid.clone(), label: "object" };
  }
  return { point: p, label };
}

function round(value: number, grid: number) {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}
