# Shapes tool: icon picker + per-edge editing

## 1. Rename

"Place" becomes **Shapes** everywhere (toolbar label, help text). The `place` id is kept so saved prefs still match.

## 2. Shape icons at the top of the screen

The text chips leave the bottom strip and become an icon bar pinned at the top:

- Row 1 — **3D**: box, sphere, cylinder, cone, prism, torus, wedge, …
- Row 2 — **2D**: rectangle, circle, ellipse, polygon, star, triangle, arc, …
- Each entry is a drawn outline icon of the real shape (not a letter). Tap to arm it; the active shape lights up.
- Rows are horizontally scrollable, labelled `3D` / `2D` on the left, and show only while the Shapes tool is open. They hide in Clear mode.

## 3. Increment control: digit × decimal place

One shared increment picker replaces the old step chips and applies to every stepper in the strip (edge length, extrude, rotation, angle):

```text
increment   [1][2][3][4][5][6][7][8][9]   ×  [10] [1] [0.1] [0.01] [0.001]
                     ^ digit                        ^ decimal place
```

The active increment is `digit × place` (e.g. `3 × 0.01 = 0.03`), shown live next to every −/+. Persisted with the existing control prefs.

## 4. No sliders — edge editing is the core

The shape's **edges** are the editable unit. After a shape is chosen (or an object selected), the strip becomes an edge editor:

- The selected edge's **length** is a large −/+ stepper (one tap = one increment) with a tappable number for exact entry.
- Edges highlight on the 3D ghost/object; the highlighted edge is bright, the rest dim.
- **Swipe sideways** to move the highlight to the next edge; it cycles through every edge and repeats.
- **Multi-select**: tap a "select more" control (or two-finger tap edges) to grab several edges at once. The length stepper then edits all of them together; curving also applies to all of them.
- Editing one edge may indirectly move neighbouring edges (that is expected and fine).
- A **Link** toggle locks all edges to move together (uniform scale), off by default.

## 5. Curve a line

- A **Curve** toggle on the selected edge(s) turns a straight edge into an arc/bezier.
- −/+ steppers (same increment) set the curve amount; dragging the edge also bends it.
- **Mirror mode**: when several **parallel** edges are selected (e.g. the four vertical edges of a box), curving one curves the others in directions that mirror across the shape — front/back bow opposite ways, left/right opposite ways — so the result stays symmetric instead of all bowing the same way.

## 6. Angle of a line

- The selected edge's angle can be set by **typing a number**, or by picking a **set angle** chip: `0° 15° 30° 45° 60° 75° 90°`.
- Same −/+ steppers and decimal increment work here too.

## 7. Advanced (appears after a shape is chosen)

A single **Advanced** button reveals, only for the armed/selected shape:

- **2D ⇄ 3D toggle** — flip a flat profile into a solid (or back). For 2D shapes this is the extrude on/off switch.
- **Extrude** height — −/+ stepper + typed value (only meaningful for 2D→3D).
- **Change shape** — a compact picker to morph the current object into a different shape while keeping its position/edges where possible.
- **Rotation** — X/Y/Z rotation as −/+ steppers with the shared increment.
- Sides (polygon/prism/star only) stays as a −/+ row here, not in the main strip.

`curve` corner-rounding, `bend`, `taper`, and `bend axis` are **deleted** from the app entirely — removed from the object model, geometry builder, and UI.

## 8. The 3D space

- **Open space below the ground.** The solid 600×600 floor plane at Y=0 is removed, so you can fly below the X/Z surface and look back up. Objects under the ground are fully visible.
- **Ground stays a line grid.** The same lined grid remains as the ground reference, drawn double-sided so it reads from underneath too, and fading with distance instead of ending at a hard edge.
- **Ruler overlay removed.** The screen-locked X/Y/Z lines with scrolling numbers are deleted. In their place, a single small coordinate readout (`X / Y / Z` of the placement point) sits in a corner of the screen.
- The three coloured world axis lines through the origin stay, and the Y line extends well below zero so you keep your bearings underground.
- Taps on empty space (deselect, measure picks, tap-target) still work: an invisible pick plane replaces the visible floor, so nothing about selection or placement changes.

## 9. Kept as-is

Add / Place-here button, Repeat, recent-shape quick bar, Confirm toggle, snapping, collision, and the screen-centre ghost are unchanged. The same edge strip is reused when an already-placed object is selected, so building and editing use identical controls.


## Technical notes

- `ShapeBar` (top HUD): inline SVG outline icons keyed by `ShapeKind`, driven by `SHAPES_3D` / `SHAPES_2D`.
- `Stepper` component (label, value, −/+, tap-to-type) replaces `NumRow`/`Slider` in the Shapes strip.
- `increment` state = `digit * place`, persisted in `vb.controls.v1`; `STEPS` kept for old saved prefs.
- **Edge model**: `PlacedObject` gains an `edges` descriptor — an ordered list of `{ a: vertIndex, b: vertIndex, length, curve, angle }` derived from the base shape's topology. `geometry.ts` grows an `edgesFor(kind, dims, sides)` function returning the ordered edge list and vertex positions; the mesh builder consumes those edges so per-edge length/curve/angle changes rebuild the geometry.
- Edge highlight + swipe cycling + multi-select is pure UI state in `CadApp.tsx` (`selectedEdge`, `selectedEdges`).
- **Mirror curve**: when applying a curve to a multi-selection of parallel edges, the sign of the curve is flipped per edge based on its outward face normal, so opposite edges bow oppositely.
- Remove `bend`, `taper`, `bendAxis`, and corner `curve` from `GeometrySpec`, `specOf`, `buildGeometry`, `PlacedObject`, and the AI builder tool schema. Existing saved scenes with those fields hydrate to ignored values.
- **Scene**: delete the opaque ground `planeGeometry` in `Scene.tsx` and move its pointer handlers to an invisible (`visible={false}`) pick plane; keep the drei `<Grid />` with `side={THREE.DoubleSide}`; extend the Y axis line downward. Delete `AxisHud.tsx` usage and replace it with a compact corner coordinate chip fed by the existing `subscribeCenter` store; `tickUnitFor` becomes unused and is removed.

