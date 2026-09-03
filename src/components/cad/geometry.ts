import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION, INTERSECTION, ADDITION } from "three-bvh-csg";
import { applyEdgeMods, edgeModsKey, extractEdges, type EdgeInfo, type EdgeMod } from "./edges";

export type { EdgeInfo, EdgeMod } from "./edges";

// ---------------------------------------------------------------------------
// Shape catalog
// ---------------------------------------------------------------------------

export const SHAPES_3D = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "pyramid",
  "wedge",
  "torus",
  "capsule",
  "tube",
  "tetra",
  "octa",
  "icosa",
  "dodeca",
] as const;

export const SHAPES_2D = [
  "rect",
  "circle",
  "ellipse",
  "triangle",
  "polygon",
  "star",
  "slot",
  "arc",
] as const;

export type Shape3D = (typeof SHAPES_3D)[number];
export type Shape2D = (typeof SHAPES_2D)[number];
export type ShapeKind = Shape3D | Shape2D;

export function is2D(kind: ShapeKind): kind is Shape2D {
  return (SHAPES_2D as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// 2D profiles (unit-sized, centered on origin, in the XY plane)
// ---------------------------------------------------------------------------

export function profileShape(kind: Shape2D, sides = 6, curve = 0): THREE.Shape {
  const s = new THREE.Shape();
  const r = 0.5;
  switch (kind) {
    case "circle":
      s.absarc(0, 0, r, 0, Math.PI * 2, false);
      break;
    case "ellipse":
      s.absellipse(0, 0, r, r * 0.6, 0, Math.PI * 2, false, 0);
      break;
    case "triangle":
      s.moveTo(0, r);
      s.lineTo(-r, -r);
      s.lineTo(r, -r);
      s.closePath();
      break;
    case "polygon": {
      const n = Math.max(3, Math.round(sides));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      break;
    }
    case "star": {
      const n = Math.max(3, Math.round(sides));
      for (let i = 0; i < n * 2; i++) {
        const rad = i % 2 === 0 ? r : r * 0.45;
        const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      break;
    }
    case "slot": {
      const w = r,
        h = r * 0.35;
      s.moveTo(-w + h, -h);
      s.lineTo(w - h, -h);
      s.absarc(w - h, 0, h, -Math.PI / 2, Math.PI / 2, false);
      s.lineTo(-w + h, h);
      s.absarc(-w + h, 0, h, Math.PI / 2, (3 * Math.PI) / 2, false);
      s.closePath();
      break;
    }
    case "arc": {
      const outer = r;
      const inner = r * 0.55;
      s.absarc(0, 0, outer, 0, Math.PI, false);
      s.absarc(0, 0, inner, Math.PI, 0, true);
      s.closePath();
      break;
    }
    case "rect":
    default: {
      // `curve` rounds the corners (0 = square, 1 = fully rounded)
      const k = THREE.MathUtils.clamp(curve, 0, 1) * r;
      if (k <= 0.0001) {
        s.moveTo(-r, -r);
        s.lineTo(r, -r);
        s.lineTo(r, r);
        s.lineTo(-r, r);
        s.closePath();
      } else {
        s.moveTo(-r + k, -r);
        s.lineTo(r - k, -r);
        s.quadraticCurveTo(r, -r, r, -r + k);
        s.lineTo(r, r - k);
        s.quadraticCurveTo(r, r, r - k, r);
        s.lineTo(-r + k, r);
        s.quadraticCurveTo(-r, r, -r, r - k);
        s.lineTo(-r, -r + k);
        s.quadraticCurveTo(-r, -r, -r + k, -r);
        s.closePath();
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Base geometry per kind (unit size = 1)
// ---------------------------------------------------------------------------

function baseGeometry(
  kind: ShapeKind,
  sides: number,
  extrude: number,
  profile: Shape2D | null,
): THREE.BufferGeometry {
  // A profile applied to a solid rebuilds it as an extrusion of that outline,
  // so the end face takes the profile and the side faces re-loft to match.
  if (profile && !is2D(kind)) {
    return extrudedProfile(profile, sides, 1);
  }

  if (is2D(kind)) {
    const shape = profileShape(kind, sides);
    if (extrude > 0) return extrudedFromShape(shape, extrude);
    const g = new THREE.ShapeGeometry(shape, 32);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  switch (kind) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 22);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, Math.max(3, sides > 2 ? sides : 32));
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, Math.max(3, sides > 2 ? sides : 32));
    case "pyramid":
      return new THREE.ConeGeometry(0.7, 1, 4);
    case "wedge": {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, -0.5);
      shape.lineTo(0.5, -0.5);
      shape.lineTo(-0.5, 0.5);
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      return g;
    }
    case "torus":
      return new THREE.TorusGeometry(0.35, 0.15, 18, 40);
    case "capsule":
      return new THREE.CapsuleGeometry(0.3, 0.5, 8, 20);
    case "tube":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1, true);
    case "tetra":
      return new THREE.TetrahedronGeometry(0.6);
    case "octa":
      return new THREE.OctahedronGeometry(0.6);
    case "icosa":
      return new THREE.IcosahedronGeometry(0.6);
    case "dodeca":
      return new THREE.DodecahedronGeometry(0.6);
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1, 8, 8, 8);
  }
}

function extrudedFromShape(shape: THREE.Shape, depth: number) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 32,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

function extrudedProfile(kind: Shape2D, sides: number, depth: number) {
  return extrudedFromShape(profileShape(kind, sides), depth);
}

// ---------------------------------------------------------------------------
// Deformers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Booleans
// ---------------------------------------------------------------------------

const evaluator = new Evaluator();
evaluator.useGroups = false;

export type BooleanOp = "subtract" | "union" | "intersect";

const OPS = {
  subtract: SUBTRACTION,
  union: ADDITION,
  intersect: INTERSECTION,
} as const;

/**
 * Evaluate `op` between a base geometry (in the base object's local space) and
 * a tool geometry given in world space, with the base's world matrix.
 */
export function evaluateBoolean(
  baseGeo: THREE.BufferGeometry,
  baseMatrix: THREE.Matrix4,
  toolGeo: THREE.BufferGeometry,
  toolMatrix: THREE.Matrix4,
  op: BooleanOp,
): THREE.BufferGeometry | null {
  try {
    const a = new Brush(baseGeo.clone());
    a.matrix.copy(baseMatrix);
    a.matrix.decompose(a.position, a.quaternion, a.scale);
    a.updateMatrixWorld(true);

    const b = new Brush(toolGeo.clone());
    b.matrix.copy(toolMatrix);
    b.matrix.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);

    const result = evaluator.evaluate(a, b, OPS[op]);
    const out = result.geometry.clone();
    const count = out.getAttribute("position")?.count ?? 0;
    // An empty (or degenerate) result means the cut swallowed the solid — reject it.
    if (count < 12) return null;
    // Evaluator keeps the result geometry in brush A's local coordinate space
    // and puts A's world transform on the returned Brush. Applying the inverse
    // matrix here a second time displaced/scaled the geometry away from its mesh,
    // which made a successful cut look like the entire object was deleted.
    const position = out.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!position) return null;
    for (let i = 0; i < position.count; i++) {
      if (
        !Number.isFinite(position.getX(i)) ||
        !Number.isFinite(position.getY(i)) ||
        !Number.isFinite(position.getZ(i))
      ) {
        return null;
      }
    }
    out.computeBoundingBox();
    if (!out.boundingBox || out.boundingBox.isEmpty()) return null;
    out.computeVertexNormals();
    return out;
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------------------
// Public builder + cache
// ---------------------------------------------------------------------------

export type GeometrySpec = {
  kind: ShapeKind;
  sides: number;
  extrude: number;
  profile: Shape2D | null;
  /** Per-edge curve / angle tweaks applied to the unit geometry. */
  edges: EdgeMod[];
  /**
   * Cross-section taper along the vertical axis. Every horizontal slice keeps
   * its own shape (square stays square, circle stays circle) and only changes
   * size: positive widens the top, negative widens the bottom.
   */
  taper?: number;
};

/**
 * Scales each horizontal slice of a geometry about the vertical axis, so the
 * shape reads like stacked slices of the same outline at different sizes.
 */
export function applyTaper(geo: THREE.BufferGeometry, taper: number) {
  const t = THREE.MathUtils.clamp(taper, -1, 1);
  if (!t) return geo;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const y0 = bb.min.y;
  const h = bb.max.y - y0;
  if (h < 1e-6) return geo;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + t * ((y - y0) / h - 0.5);
    const f = Math.max(0.02, k);
    pos.setX(i, pos.getX(i) * f);
    pos.setZ(i, pos.getZ(i) * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

const cache = new Map<string, THREE.BufferGeometry>();

export function specKey(s: GeometrySpec) {
  return [
    s.kind,
    s.sides,
    s.extrude,
    s.profile ?? "-",
    edgeModsKey(s.edges ?? []),
  ].join("|");
}

export function buildGeometry(spec: GeometrySpec): THREE.BufferGeometry {
  const key = specKey(spec);
  const hit = cache.get(key);
  if (hit) return hit;

  let geo = baseGeometry(spec.kind, spec.sides, spec.extrude, spec.profile);
  const mods = spec.edges ?? [];
  if (mods.some((m) => m.curve || m.angle)) {
    geo = applyEdgeMods(geo.clone(), edgesOf(spec), mods);
  }
  geo.computeBoundingBox();

  if (cache.size > 240) cache.clear();
  cache.set(key, geo);
  return geo;
}

const edgeCache = new Map<string, EdgeInfo[]>();

/** Ordered edge list for a spec's *base* shape (ignoring edge mods). */
export function edgesOf(spec: GeometrySpec): EdgeInfo[] {
  const key = [spec.kind, spec.sides, spec.extrude, spec.profile ?? "-"].join("|");
  const hit = edgeCache.get(key);
  if (hit) return hit;
  const list = extractEdges(
    baseGeometry(spec.kind, spec.sides, spec.extrude, spec.profile),
  );
  if (edgeCache.size > 120) edgeCache.clear();
  edgeCache.set(key, list);
  return list;
}
