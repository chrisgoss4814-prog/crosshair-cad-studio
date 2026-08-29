import * as THREE from "three";

export type ShapeKind = "box" | "sphere" | "cylinder" | "cone";

export type PlacedObject = {
  id: string;
  kind: ShapeKind;
  position: [number, number, number];
  size: number;
};

/** Per-frame control state, mutated by the joysticks, read inside useFrame. */
export const controls = {
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  lift: 0,
};

/** Live world-space position of the crosshair, written each frame by the rig. */
export const crosshair = new THREE.Vector3();

export const SNAP = 0.5;

export function snapVec(v: THREE.Vector3, snap: boolean) {
  if (!snap) return [v.x, v.y, v.z] as [number, number, number];
  return [
    Math.round(v.x / SNAP) * SNAP,
    Math.round(v.y / SNAP) * SNAP,
    Math.round(v.z / SNAP) * SNAP,
  ] as [number, number, number];
}
