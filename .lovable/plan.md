# VectorBay: Full CAD Toolset + AI Builder

Built in three phases, in order. Each phase ships working on its own.

## Phase 1 — Modeling core

**2D shapes (sketch layer)**
- New "Sketch" tool: draw on a plane (ground, or the face you tap).
- Primitives: rectangle, circle, ellipse, polygon (n-sided), line, arc, bezier/spline.
- Sketches render as flat filled shapes and stay editable (points can be nudged with the existing decimal steps).

**Extrude**
- Select a sketch, set a height (decimal steps), extrude to a solid.
- Also: revolve a profile around an axis, and sweep a profile along a line/arc.

**Stretch (non-uniform scale)**
- Objects gain per-axis dimensions instead of a single `size`.
- Selected object shows X/Y/Z stretch handles plus numeric fields; drag or type.

**Curve / bend**
- Arc and bezier tools inside the sketch layer.
- Bend and taper modifiers on solids, along a chosen axis, with an angle slider.
- Profile-to-face: pick a 2D profile, tap a face of a solid, and the solid is rebuilt so that face takes the profile's outline while the connecting faces re-loft to match.

**Cut (booleans)**
- Subtract, union, intersect between any two solids.
- Cut a hole with either a 3D solid or an extruded 2D profile (circle hole, slot, custom outline) pushed through a face at a chosen depth.
- Cuts are recorded as history so they can be undone/edited.

**Shape-to-shape snapping**
- Snap targets beyond the grid: face centers, face corners, edge midpoints, vertices, and object centers.
- Nearby snap candidates highlight while placing or dragging; the ghost jumps to the nearest one.
- Alignment guides show when two objects line up on an axis.

**Tap-to-target**
- Tap any object face (or the ground) to plant the placement point there; the next Add drops the shape at that exact spot, oriented to the face normal.
- Works alongside the existing screen-center targeting; tapping sets a sticky target, a second tap clears it.

## Phase 2 — Controls

- Joystick sensitivity: a speed slider (e.g. 10%–200%) for move, look, and lift, plus a one-tap "precision" toggle that drops to a slow crawl for fine positioning.
- Optional acceleration curve so small stick deflections stay very slow.
- Settings persist locally with the scene prefs.

## Phase 3 — AI builder

- Chat panel: describe what you want ("a 3-metre brick wall with an arched doorway") and the AI builds it.
- The AI does not draw meshes directly — it calls the app's own tools (place, sketch, extrude, cut, stretch, bend, snap, group) through a defined tool schema, so every AI action is a normal, undoable, editable app action.
- Streaming plan preview: you see the steps as it works, and can Accept or Reject the result.
- Getting better over time, both ways you asked for:
  - **Preferences profile** — remembered defaults (typical sizes, materials, spacing, snap habits) it applies automatically.
  - **Example library** — accepted builds (and rejected ones, with the correction) are saved and the most relevant past examples are fed back as context on future requests, so its output drifts toward how you actually build.
- Requires Lovable Cloud (built-in backend) for the saved examples, preferences, and secure AI calls.

## Technical notes

- Geometry: `three-bvh-csg` (with three-mesh-bvh) for booleans; `THREE.Shape` + `ExtrudeGeometry`/`LatheGeometry` for sketch extrude/revolve; custom vertex deform for bend/taper; `three.js` `Box3`/face data for snap candidates.
- Object model in `src/components/cad/state.ts` moves from a single `size` to `{ scale: [x,y,z] }` plus an optional `ops` array (extrude, bend, boolean, profile-face) — a small feature tree per object, so edits stay non-destructive and serializable to localStorage and Cloud.
- Snapping candidates precomputed per object and refreshed on transform; nearest-candidate search in screen space.
- AI runs server-side through Lovable AI Gateway on a TanStack server function, streaming, with a strict tool schema mirroring the editor commands; the tool calls are replayed against the same reducers the UI uses.
- Learning data (preferences + accepted/rejected build transcripts) stored in Cloud tables with row-level security so each user only sees their own.
