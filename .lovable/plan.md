# Plan: Full CAD Toolset — Stacking, Editing, Views, Measure, Local Saves

## Overview
Turn the sketchpad into a real CAD building tool:

1. **Face-snap stacking** — pillars and brick walls align to object faces.
2. **Decimal-step size selector** — pick an increment (0.001 … 10), nudge size up/down.
3. **Selection & edit** — tap an object to select; move, rotate, recolor, resize, delete.
4. **Rotation** — spin selected objects around X/Y/Z.
5. **Color & material** — per-object color, metalness, roughness.
6. **Drag-to-move** — grab a placed object and drag it through space.
7. **Duplicate/copy** — clone a selected object in place.
8. **Group / multi-select** — box-select or shift-tap multiple objects; move/rotate as one.
9. **Measure tool** — tap two points, read the distance between them.
10. **3-way camera** — switch First-person fly / Orbit / Top-down.
11. **Save & reload scenes** — local-only (localStorage); named scenes + auto-save.

---

## 1. Face-snap stacking (pillars + brick walls)

When **Snap** is on, raycast from the camera through the crosshair:

- **Hits a placed object** → ghost slides to the surface point, offset along that face's normal by half the new object's height. Point at a cylinder top → next cylinder stacks (pillar). Point at a box side → next box butts flush (brick wall). Lateral position rounds to the 0.5m grid.
- **Hits the ground / empty space** → ghost rests on the grid at ground level (object sits on the floor, not half-buried).
- Raycast distance follows the existing depth setting (D+/D−).

**Changes**
- `state.ts`: add `surfaceSnap(camera, objects) -> Vector3` + a shared `Map<id, Mesh>` registry of placed meshes.
- `Scene.tsx`: register/unregister placed meshes via refs; in the `Rig` frame loop, write the face-snapped point to `crosshair` when snap is on (pass `snap`, `size`). Ghost, plumb, readout auto-follow. Ground fallback uses half-height Y so shapes sit on the floor.
- `CadApp.tsx`: pass `snap` into `Scene`; readout shows `FACE` when locked onto a surface.

## 2. Decimal-step size selector

Replace the single cycling size button with:

- A **step toggle row** of increments: `0.001`, `0.01`, `0.1`, `1`, `10` (highlighted active).
- A **size readout** with **− / +** buttons nudging size by the active step.

Floor guard prevents zero/negative sizes. Fine 0.01 steps for brick gaps, 10 for big pillars.

**Changes**
- `CadApp.tsx`: replace size cycle button with `StepToggle` + `SizeStepper`; add `step` state (default `1`).
- `state.ts`: no schema change (`PlacedObject.size` already numeric).

## 3. Selection & editing

- Tap a placed object in the canvas → becomes the **selected** object (highlight via drei `<Edges>` outline).
- The bottom rail switches between **Place mode** (today's behavior) and **Edit mode** (Move / Rotate / Color / Resize / Delete / Duplicate / Group / Deselect).
- Edit operates on the live scene: move = offsets position (grid-snapped), resize = applies new size to the selected object, delete removes it.

**Changes**
- `state.ts`: add `selection` singleton (`id: string | null`, plus a `groupIds: Set<string>` for multi-select); extend `PlacedObject` with `rotation: [x,y,z]`, `color`, `metalness`, `roughness`.
- `Scene.tsx`: pointer events on placed meshes set `selection.id`; selected meshes render an outline.
- `CadApp.tsx`: Place/Edit toggle; `setObjects` updaters for move/resize/recolor/delete/duplicate.

## 4. Rotation

- Edit-mode **Rotate** buttons spin the selected object 90° around Y (and X/Z via a sub-toggle). Arbitrary angles via the decimal-step control.
- New objects inherit `rotation [0,0,0]`; face-snap offsets still use placement size regardless of rotation.

**Changes**
- `state.ts`: `PlacedObject.rotation` added above.
- `Scene.tsx`: apply `o.rotation` to each mesh.
- `CadApp.tsx`: rotate buttons call `setObjects` updating the selected object's rotation.

## 5. Color & material options

- A compact swatch row (6 presets + custom color) plus metalness/roughness sliders, available in both Place mode (sets the *next* object's material) and Edit mode (edits the selected object).
- Stored per object; new objects get default material unless changed.

**Changes**
- `state.ts`: extend `PlacedObject` with `color`, `metalness`, `roughness`.
- `Scene.tsx`: use `o.color/metalness/roughness` in the material; fallback defaults.
- `CadApp.tsx`: swatch + slider controls; "next material" state for place mode.

## 6. Drag-to-move objects

- In Edit mode, press-and-drag a selected object; it follows the pointer projected onto a plane (horizontal plane by default, toggle to the plane facing the camera). Position grid-snaps when Snap is on.
- Release drops it in place. Combined with the measure tool for precise repositioning.

**Changes**
- `Scene.tsx`: pointer drag handler using `THREE.Raycaster` + `Plane`; updates the dragged object's position each move frame; writes through `setObjects`.
- `CadApp.tsx`: drag affordance (cursor / outline pulse); a "drag plane" toggle (Horizontal / Facing).
- `state.ts`: a transient `dragId` in the `selection` singleton.

## 7. Duplicate / copy

- Edit-mode **Duplicate** clones the selected object (or group) in place, offset slightly so you can grab the copy; the copy becomes the new selection.
- Keeps all properties (kind, size, rotation, color, material).

**Changes**
- `CadApp.tsx`: Duplicate button → `setObjects` appends a cloned object with a fresh id, offset position, sets `selection.id` to the new id.
- `state.ts`: helper `cloneObject(o)` returning a new `PlacedObject` with fresh id.

## 8. Group / multi-select

- **Shift-tap** adds/removes objects from the selection; **box-drag** on empty space selects all enclosed objects.
- Grouped objects share a `groupId`; Move / Rotate / Duplicate / Delete act on all members of the group. A group can be named (optional).
- Selection outline highlights all members; the group's centroid shows a pivot gizmo for rotation.

**Changes**
- `state.ts`: add `groupIds: Set<string>` and `groupId` on `PlacedObject`; helpers to compute group centroid/pivot.
- `Scene.tsx`: shift-tap toggles `groupIds`; box-drag performs a screen-space selection rectangle → raycast bounds test against placed meshes; render outline + pivot gizmo.
- `CadApp.tsx`: Edit-mode actions operate over `groupIds` when present; a "Group"/"Ungroup" toggle.

## 9. Measure tool

- A dedicated **Measure** toggle in the tool rail: tap two points (on objects or ground), the app draws a line between them with a live distance label (meters).
- Distance uses true 3D Euclidean distance; the label faces the camera. Measure lines are overlay-only (not saved objects) and clear on tool exit.

**Changes**
- `Scene.tsx`: a `Measure` component storing two `Vector3` points; renders a `<Line>` (drei) + an `Html`-anchored distance label; pointer picks points via raycast.
- `state.ts`: a `measure` singleton (`a: Vector3 | null`, `b: Vector3 | null`).
- `CadApp.tsx`: Measure toggle in the rail; readout shows `D = 12.34 m`.

## 10. 3-way camera switcher

Add a **View** toggle (top-left of HUD) cycling **Fly** (today's twin-stick first-person) / **Orbit** (drei `OrbitControls`, drag to rotate, wheel to zoom) / **Top** (orthographic top-down, drag to pan, wheel to zoom, ideal for precise 2D placement).

- Fly: existing rig, crosshair-driven placement.
- Orbit: free orbit around scene origin (or selection centroid); crosshair raycasts forward as today, depth slider still works.
- Top: orthographic camera looking straight down; placement happens on the XY plane at the crosshair; great for brick layout.

**Changes**
- `state.ts`: add `view: "fly" | "orbit" | "top"` singleton.
- `Scene.tsx`: conditionally mount `OrbitControls` (orbit) or an orthographic camera + `MapControls`-style pan (top); keep the `Rig` for fly. Crosshair logic branches per view (forward raycast for fly/orbit, ground-plane intersection for top).
- `CadApp.tsx`: View toggle UI; joysticks hidden in orbit/top (orbit uses pointer drag + wheel instead). Orthographic camera keeps pixel-accurate snapping in top view.

## 11. Save & reload scenes (local-only)

- **Save** writes `objects` (ids, kind, size, position, rotation, color, metalness, roughness, groupId) to `localStorage` under a scene name; **Load** lists saved scenes and restores one; **New** clears.
- Auto-save the working scene on every change so a reload restores in-progress work; load on mount.

**Changes**
- `src/lib/scene-store.ts` (new): `saveScene`, `loadScene`, `listScenes`, `deleteScene`, `autoSave`, `loadAuto`. Pure localStorage.
- `CadApp.tsx`: Save/Load/New buttons + a small scene menu; hydrate `objects` from auto-save on mount inside `useEffect` (route already `ssr: false`).

---

## SSR / build safety
- All localStorage access stays in `useEffect` (route is already `ssr: false`).
- No new server functions; pure client state + localStorage.
- Raycasting, drag, and ortho camera all run browser-only inside the client-only route.

## Out of scope (noted for later)
- Cloud sync / multi-device scenes (would need Lovable Cloud) — local-only for now.
- Export to .glb / .obj file.
