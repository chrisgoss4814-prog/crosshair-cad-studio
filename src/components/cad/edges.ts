import * as THREE from "three";

/**
 * Per-edge modifications stored on an object. `i` indexes into the ordered
 * edge list returned by `extractEdges` for that object's base geometry.
 */
export type EdgeMod = {
  i: number;
  /** Outward bulge in local units (unit-sized geometry). */
  curve: number;
  /** Tilt of the edge about its midpoint, in degrees. */
  angle: number;
};

export type EdgeInfo = {
  index: number;
  /** Midpoint in local (unit) space. */
  mid: THREE.Vector3;
  /** Unit direction along the edge. */
  dir: THREE.Vector3;
  /** Outward direction, perpendicular to `dir`. */
  out: THREE.Vector3;
  /** Total length in local (unit) space. */
  length: number;
  /** Local-space extent of the edge on each axis. */
  extent: THREE.Vector3;
  /** Polyline for drawing the highlight. */
  points: THREE.Vector3[];
  /** True when the edge is a closed loop (circles, rims). */
  loop: boolean;
};

const KEY = 1e4;
const keyOf = (x: number, y: number, z: number) =>
  `${Math.round(x * KEY)},${Math.round(y * KEY)},${Math.round(z * KEY)}`;

class DSU {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(a: number): number {
    while (this.p[a] !== a) {
      this.p[a] = this.p[this.p[a]!]!;
      a = this.p[a]!;
    }
    return a;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[rb] = ra;
  }
}

const PARALLEL = Math.cos(THREE.MathUtils.degToRad(40));

/**
 * Feature edges of a geometry, merged into whole edges: touching segments that
 * run in nearly the same direction become one edge, so a box yields 12 edges
 * and a cylinder yields its two rims.
 */
export function extractEdges(geo: THREE.BufferGeometry): EdgeInfo[] {
  let eg: THREE.EdgesGeometry;
  try {
    eg = new THREE.EdgesGeometry(geo, 20);
  } catch {
    return [];
  }
  const pos = eg.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return [];

  const segs: { a: THREE.Vector3; b: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  for (let i = 0; i + 1 < pos.count; i += 2) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const dir = b.clone().sub(a);
    if (dir.lengthSq() < 1e-12) continue;
    segs.push({ a, b, dir: dir.normalize() });
  }
  eg.dispose();
  if (!segs.length) return [];

  const byVert = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = keyOf(p.x, p.y, p.z);
      const list = byVert.get(k);
      if (list) list.push(i);
      else byVert.set(k, [i]);
    }
  });

  const dsu = new DSU(segs.length);
  byVert.forEach((list) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = segs[list[i]!]!;
        const b = segs[list[j]!]!;
        if (Math.abs(a.dir.dot(b.dir)) >= PARALLEL) dsu.union(list[i]!, list[j]!);
      }
    }
  });

  const groups = new Map<number, number[]>();
  segs.forEach((_, i) => {
    const r = dsu.find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });

  const center = new THREE.Vector3();
  geo.computeBoundingBox();
  geo.boundingBox?.getCenter(center);

  const out: EdgeInfo[] = [];
  groups.forEach((list) => {
    const pts: THREE.Vector3[] = [];
    let length = 0;
    const box = new THREE.Box3();
    for (const si of list) {
      const s = segs[si]!;
      pts.push(s.a, s.b);
      length += s.a.distanceTo(s.b);
      box.expandByPoint(s.a);
      box.expandByPoint(s.b);
    }
    // Farthest pair of endpoints gives the dominant direction.
    let far = 0;
    let pa = pts[0]!;
    let pb = pts[0]!;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = pts[i]!.distanceToSquared(pts[j]!);
        if (d > far) {
          far = d;
          pa = pts[i]!;
          pb = pts[j]!;
        }
      }
    }
    const span = Math.sqrt(far);
    const loop = span < length * 0.55;
    const mid = box.getCenter(new THREE.Vector3());
    const dir =
      span > 1e-6 ? pb.clone().sub(pa).normalize() : new THREE.Vector3(1, 0, 0);
    let outward = mid.clone().sub(center);
    outward.addScaledVector(dir, -outward.dot(dir));
    if (outward.lengthSq() < 1e-10) {
      outward = new THREE.Vector3(0, 1, 0);
      outward.addScaledVector(dir, -outward.dot(dir));
      if (outward.lengthSq() < 1e-10) outward.set(1, 0, 0);
    }
    outward.normalize();

    out.push({
      index: 0,
      mid,
      dir,
      out: outward,
      length,
      extent: box.getSize(new THREE.Vector3()),
      points: orderPolyline(list.map((i) => segs[i]!)),
      loop,
    });
  });

  out.sort(
    (a, b) =>
      a.mid.y - b.mid.y ||
      a.mid.x - b.mid.x ||
      a.mid.z - b.mid.z ||
      a.length - b.length,
  );
  out.forEach((e, i) => (e.index = i));
  return out;
}

/** Chains segments end-to-end so the highlight draws as a continuous line. */
function orderPolyline(list: { a: THREE.Vector3; b: THREE.Vector3 }[]) {
  if (list.length === 1) return [list[0]!.a, list[0]!.b];
  const used = new Array(list.length).fill(false);
  const chain: THREE.Vector3[] = [list[0]!.a, list[0]!.b];
  used[0] = true;
  let added = true;
  while (added) {
    added = false;
    for (let i = 0; i < list.length; i++) {
      if (used[i]) continue;
      const s = list[i]!;
      const head = chain[0]!;
      const tail = chain[chain.length - 1]!;
      if (s.a.distanceToSquared(tail) < 1e-8) {
        chain.push(s.b);
      } else if (s.b.distanceToSquared(tail) < 1e-8) {
        chain.push(s.a);
      } else if (s.a.distanceToSquared(head) < 1e-8) {
        chain.unshift(s.b);
      } else if (s.b.distanceToSquared(head) < 1e-8) {
        chain.unshift(s.a);
      } else {
        continue;
      }
      used[i] = true;
      added = true;
    }
  }
  return chain;
}

function smooth(t: number) {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}

/**
 * Applies per-edge curve (outward bulge) and angle (tilt about the midpoint) to
 * a unit-sized geometry.
 *
 * A curve bows only the edges you picked: the bulge fades to nothing at each
 * edge's own endpoints, and afterwards every edge you did NOT curve is
 * re-straightened onto the line between its (possibly moved) corners. So
 * curving four upright edges of a box bows those four lines while the bottom
 * rails stay dead straight, only changing length to keep up.
 */
export function applyEdgeMods(
  geo: THREE.BufferGeometry,
  edges: EdgeInfo[],
  mods: EdgeMod[],
): THREE.BufferGeometry {
  const active = mods.filter((m) => m.curve || m.angle);
  if (!active.length || !edges.length) return geo;

  geo.computeBoundingBox();
  const size = geo.boundingBox!.getSize(new THREE.Vector3());
  const reach = Math.max(0.25, Math.max(size.x, size.y, size.z) * 0.75);

  const pos = geo.getAttribute("position") as THREE.BufferAttribute;

  // Original positions, so "which edge is this vertex on" stays stable while
  // we push vertices around.
  const orig = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    orig[i * 3] = pos.getX(i);
    orig[i * 3 + 1] = pos.getY(i);
    orig[i * 3 + 2] = pos.getZ(i);
  }
  const byPos = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(orig[i * 3]!, orig[i * 3 + 1]!, orig[i * 3 + 2]!);
    const list = byPos.get(k);
    if (list) list.push(i);
    else byPos.set(k, [i]);
  }

  const v = new THREE.Vector3();
  const rel = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const disp = new THREE.Vector3();

  for (const m of active) {
    const e = edges[m.i];
    if (!e) continue;
    const tan = Math.tan(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(m.angle, -80, 80)));
    const half = Math.max(1e-3, e.length / 2);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      rel.set(orig[i * 3]!, orig[i * 3 + 1]!, orig[i * 3 + 2]!).sub(e.mid);
      const along = rel.dot(e.dir);
      perp.copy(rel).addScaledVector(e.dir, -along);
      const d = perp.length();
      const w = smooth(1 - d / reach);
      if (w <= 0) continue;
      // Along the edge: strongest at the middle, but the ends still take a
      // uniform share, so the corners travel outward together and the faces
      // they belong to grow/shrink instead of pinching.
      const t = THREE.MathUtils.clamp(along / half, -1, 1);
      const bow = Math.max(0, 1 - t * t);
      const wAlong = e.loop ? 1 : END_SHARE + (1 - END_SHARE) * bow;
      disp.set(0, 0, 0);
      if (m.curve) disp.addScaledVector(e.out, m.curve * w * wAlong);
      if (tan) disp.addScaledVector(e.out, tan * t * half * w);
      pos.setXYZ(i, v.x + disp.x, v.y + disp.y, v.z + disp.z);
    }
  }

  // Re-straighten untouched edges: they may have shifted, but they must never
  // pick up curvature the user didn't ask for.
  const touched = new Set(active.map((m) => m.i));
  {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const e of edges) {
      if (touched.has(e.index) || e.loop || e.points.length < 2) continue;

      const first = e.points[0]!;
      const last = e.points[e.points.length - 1]!;
      const span = last.distanceTo(first);
      if (span < 1e-6) continue;
      const idxA = byPos.get(keyOf(first.x, first.y, first.z));
      const idxB = byPos.get(keyOf(last.x, last.y, last.z));
      if (!idxA?.length || !idxB?.length) continue;
      a.fromBufferAttribute(pos, idxA[0]!);
      b.fromBufferAttribute(pos, idxB[0]!);
      for (const p of e.points) {
        const idx = byPos.get(keyOf(p.x, p.y, p.z));
        if (!idx?.length) continue;
        const t = p.distanceTo(first) / span;
        v.copy(a).lerp(b, THREE.MathUtils.clamp(t, 0, 1));
        for (const i of idx) pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

export const edgeModsKey = (mods: EdgeMod[]) =>
  mods.length
    ? mods.map((m) => `${m.i}:${+m.curve.toFixed(4)}:${+m.angle.toFixed(3)}`).join(",")
    : "-";
