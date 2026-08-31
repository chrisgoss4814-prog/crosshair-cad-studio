# Sketch lines, curves, and endpoint snapping

A proper 2D sketch layer: draw line segments, chain them into paths, curve any segment with bezier handles, and snap ends onto each other and onto existing geometry.

## Line tool

- New **Line** toolbar alongside the existing shape toolbars.
- Tap to drop a point, tap again for the next — a chain of connected segments. Double-tap or a **Finish** button ends the chain; **Undo point** removes the last one.
- Lines draw on the active plane: the ground, or the face you tapped (uses the existing tap-target).
- Each point can be nudged afterwards with the existing decimal step buttons, or typed in numerically.
- Segments render as thin bright strokes with small round handles at every point, visible only while the sketch is selected.

## Curving a segment

- Select a segment, tap **Curve**: two bezier control handles appear, one per end.
- Drag a handle to shape the curve; the tangent is mirrored across a shared point so joined curves stay smooth unless you break the handle.
- Numeric handle offsets available too, using the current decimal step.
- **Straighten** returns the segment to a plain line.

## Endpoint snapping

While drawing or dragging a point, the nearest candidate within a screen-space radius highlights and the point jumps to it. Candidates:

- Endpoints of other segments (primary)
- Segment midpoints and nearest-point-on-segment
- Object corners, edge midpoints, and face centers on solids (reuses existing shape-snap targets)
- Grid step, plus 15-degree angle lock relative to the previous point

A small label names the snap that is active ("endpoint", "midpoint", "45 degrees"), and a chip toggles each snap family so you can turn off what gets in the way.

## Closing a loop

When a new point lands on the chain's first point, a prompt offers three choices:

- **Fill** — the loop becomes a flat filled 2D face, treated like the other 2D profiles
- **Extrude** — fill it and immediately open the extrude height field to make a solid
- **Keep as lines** — stays pure line geometry, usable as a guide

The choice is remembered as a default and can be changed later from the sketch's own toolbar (a filled loop can go back to lines, and a closed line loop can be filled at any time).

## Also included

- Sketches save and load with the scene, and are selectable, movable, duplicable, groupable and deletable like any other object.
- Long-press descriptions for every new control, added to the Guide sheet.

## Technical notes

- New object type `sketch` in `src/components/cad/state.ts`: an ordered point list plus per-segment `{ curve: null | { h1, h2 } }`, stored on a plane (origin + normal) so it serialises to localStorage with everything else.
- Geometry built in `src/components/cad/geometry.ts` from `THREE.Path` with `lineTo` / `bezierCurveTo`; closed + filled loops go through `THREE.Shape` so the existing `ExtrudeGeometry` path handles extrusion unchanged.
- Rendering: `Line2` / `LineMaterial` from three's examples for consistent stroke width on mobile, with instanced handle dots.
- Snapping: candidate points collected per frame from nearby sketches and the existing solid snap-candidate cache, matched in screen space so the pull radius feels the same at any zoom.
- Segment picking uses a screen-space distance test against the sampled polyline rather than mesh raycasting, since thin lines are hard to hit on a phone.
