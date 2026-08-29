# Plan: Stack & Face Snapping (pillars + brick walls)

## Goal
Make placement snap onto the faces of already-placed objects, so cylinders stack into pillars and boxes butt together into brick walls — aligned to the exact size of the shape you're placing.

## How it works
When **Snap** is on, the app raycasts from the camera through the crosshair into the scene:

- **Crosshair hits a placed object** → the ghost slides to the *surface point* and is offset along that face's normal by half the new object's height. Point at the top of a cylinder → next cylinder sits exactly on top (pillar). Point at the side of a box → next box sits flush beside it (brick). Lateral position still rounds to the 0.5m grid so walls stay tidy.
- **Crosshair hits the ground plane (or empty space)** → ghost rests on the grid at ground level, as today.
- The raycast distance follows the existing depth setting (D+/D−), so you can still reach far objects.

## Changes

**src/components/cad/state.ts**
- Add a `surfaceSnap(camera, objects) -> THREE.Vector3` helper: builds a raycaster from camera center, tests against placed meshes, returns snapped position (face point + half-height offset, grid-rounded laterally); falls back to ground-projected point.
- Track placed meshes via a shared registry (`Map<id, THREE.Mesh>`) so the raycaster has targets.

**src/components/cad/Scene.tsx**
- Register/unregister each placed object's mesh in the registry (via `ref`).
- In the `Rig`'s frame loop, replace the raw `crosshair` point with the surface-snapped point when snap is on (pass `snap` + `size` down). Ghost, plumb line, and readout automatically follow since they already read `crosshair`.
- Objects float at the crosshair's Y today; ground fallback keeps Y at half the object height so shapes sit on the floor instead of half-buried.

**src/components/cad/CadApp.tsx**
- Pass `snap` into `Scene`.
- `addObject` stays the same (it already reads `crosshair`), so no placement-logic duplication.
- Small readout tweak: show `FACE` when the crosshair is locked onto a surface, so you know stacking is engaged.

## UX notes
- Snap off = today's free-floating crosshair behavior, unchanged.
- Works with every shape kind and size; the half-height offset uses the currently selected size, so mixing sizes still lands flush.
- Undo, tool rail, and telemetry stay as-is.
