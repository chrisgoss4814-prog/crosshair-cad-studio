# Plan: Stacking + Editing, Save/Reload, Rotation, Materials, Decimal Size Control

## Overview
Upgrade the CAD sketchpad from "place primitives on a grid" to a real stacking + editing toolset:

1. **Face-snap stacking** — pillars and brick walls align to object faces.
2. **Decimal-step size selector** — pick an increment (0.001, 0.01, 0.1, 1, 10, …) then nudge size up/down by that step.
3. **Selection & edit** — tap a placed object to select, then move/rotate/recolor/resize/delete it.
4. **Rotation** — spin selected objects 90° (or arbitrary) around X/Y/Z.
5. **Color & material** — per-object color, metalness, roughness.
6. **Save & reload scenes** — persist builds locally and re-open named scenes.

---

## 1. Face-snap stacking (pillars + brick walls)

When **Snap** is on, raycast from the camera through the crosshair into the scene:

- **Hits a placed object** → ghost slides to the surface point, offset along that face's normal by half the new object's height. Point at the top of a cylinder → next cylinder stacks on top (pillar). Point at the side of a box → next box butts flush (brick wall). Lateral position still rounds to the 0.5m grid.
- **Hits the ground / empty space** → ghost rests on the grid at ground level (object sits on the floor, not half-buried).
- Raycast distance follows the existing depth setting (D+/D−).

**Changes**
- `state.ts`: add `surfaceSnap(camera, objects) -> Vector3` + a shared `Map<id, Mesh>` registry of placed meshes.
- `Scene.tsx`: register/unregister placed meshes via refs; in the `Rig` frame loop, write the face-snapped point to `crosshair` when snap is on (pass `snap`, `size`). Ghost, plumb, readout auto-follow. Ground fallback uses half-height Y so shapes sit on the floor.
- `CadApp.tsx`: pass `snap` into `Scene`; readout shows `FACE` when locked onto a surface.

## 2. Decimal-step size selector

Replace the single cycling size button with a two-part control:

- A **step toggle row** of preset increments: `0.001`, `0.01`, `0.1`, `1`, `10` (highlighted when active).
- A **size readout** with **− / +** buttons that nudge the current size by the active step.

So you can grow a block 0.01 at a time for fine brick gaps, or jump by 10 for big pillars. Floor/ceiling guards prevent negative sizes.

**Changes**
- `CadApp.tsx`: replace the `size` cycle button with `StepToggle` + `SizeStepper`; add `step` state (default `1`).
- `state.ts`: `PlacedObject.size` already numeric — no schema change.

## 3. Selection & editing

- Tap a placed object in the canvas → it becomes the **selected** object (highlight outline; the current `lastId` highlight evolves into a real selection).
- With a selection active, the bottom rail switches from "place mode" to **edit mode**: Move, Rotate, Recolor, Resize, Delete, Deselect. A "Place" toggle returns to placing new objects.
- Edit operates on the live scene: move = offsets position (with grid snap), resize = applies the new size to the selected object, delete removes it.

**Changes**
- `state.ts`: add `selectedId` to a small `selection` singleton (mirrors `controls`), plus `PlacedObject` gains `rotation: [x,y,z]`, `color`, `metalness`, `roughness`.
- `Scene.tsx`: pointer events on placed meshes set `selection.id`; selected mesh renders an `<Edges>` outline (drei) or scaled wireframe.
- `CadApp.tsx`: edit-mode rail; `setObjects` updaters for move/resize/recolor/delete; "Place/Edit" toggle.

## 4. Rotation

- Edit-mode **Rotate** buttons spin the selected object 90° around Y (and X/Z via a sub-toggle or long-press). Arbitrary angles via the decimal-step control too.
- New objects inherit rotation `0,0,0`; face-snap offsets still use the placement size regardless of rotation.

**Changes**
- `state.ts`: `PlacedObject.rotation` added above.
- `Scene.tsx`: apply `o.rotation` to the mesh.
- `CadApp.tsx`: rotate buttons call `setObjects` updating the selected object's rotation.

## 5. Color & material options

- A compact swatch row (e.g. 6 presets + custom) plus metalness/roughness sliders in edit mode, and also in place mode (sets the *next* object's material).
- Color is stored per object; metalness/roughness likewise.

**Changes**
- `state.ts`: extend `PlacedObject` with `color`, `metalness`, `roughness`.
- `Scene.tsx`: use `o.color/metalness/roughness` in the material; fallback defaults for new objects.
- `CadApp.tsx`: swatch + slider controls; "next material" state for place mode.

## 6. Save & reload scenes

- A **Save** button writes the current `objects` array (ids, kind, size, position, rotation, color, metalness, roughness) to `localStorage` under a scene name; a **Load** button lists saved scenes and restores one.
- Auto-save the working scene on changes so a reload restores in-progress work; "New" clears it.

**Changes**
- `src/lib/scene-store.ts` (new): `saveScene(name, objects)`, `loadScene(name)`, `listScenes()`, `deleteScene(name)`, `autoSave(objects)`, `loadAuto()`. Pure localStorage; no backend.
- `CadApp.tsx`: Save/Load/New buttons + a small scene menu; hydrate `objects` from auto-save on mount (inside `useEffect`, SSR-safe via the existing client-only route).

## SSR / build safety
- All localStorage access stays in `useEffect` (route is already `ssr: false`).
- No new server functions; pure client state + localStorage.
- Raycasting uses `THREE.Raycaster` inside the frame loop (browser only) — safe under client-only mounting.

## Out of scope (for now)
- Cloud sync / multi-device scenes (would need Lovable Cloud) — noted as a future option.
- Export to .glb / .obj file.
