# Focused toolbars, working cut, real snapping, and motion

## 1. Fix the cut tool

Today a cut uses the whole active shape at its current stretch, dropped at the point you tapped, and a flat 2D profile has no thickness — so the cutter either swallows the object or produces an empty solid, and the object vanishes.

Changes:
- Cut gets its own sizing: cut width, height and depth fields with the same decimal step control as everything else, independent of the place-shape stretch.
- The cutter is oriented to the face you tap and sunk into the surface by the depth you set, so tapping a wall makes a hole that deep (not through the whole object unless depth exceeds thickness).
- 2D profiles used as cutters are automatically given thickness from the depth value.
- Live cut preview: a translucent red ghost of the cutter sits on the tapped face; you adjust size/depth and confirm before it is applied.
- Safety net: if a cut would leave nothing (empty result), it is rejected with a message instead of deleting the object.
- Undo cut stays available per object.

## 2. One toolbar per category, focus mode

A single bottom bar with categories: Move, Place, Edit, Stretch, Cut, Snap, Motion, AI, Scene.

Tapping a category opens only that category's controls in a slim strip at the bottom, and everything else (other panels, side rails, labels) hides so the shape stays visible. Tapping the category again, or a close button, returns to the bar. Joysticks stay unless you hide them.

Each control strip is compact (one or two rows), sits at the very bottom edge, and can be collapsed to a thin handle while you drag or nudge so the object is never covered.

## 3. Decimal steps everywhere

A shared step selector (0.001 / 0.01 / 0.1 / 1 / 10) applies to any slider or nudge in the open strip: stretch, cut size, drag increment, rotation. Sliders snap to the active step, and every value has −/+ buttons that move exactly one step plus a typed field.

## 4. Speed slider

Replace the fixed precision crawl with a continuous speed slider (roughly 5%–300%) in the Move strip, with the precision toggle now just a quick jump to a low value you can set. Separate sub-sliders for move, look and lift speed. Saved with your preferences.

## 5. Snapping that works

- Snap toggle actually applies to placement and to dragging: while you drag, nearby snap targets (faces, corners, edge midpoints, centers) light up and the object jumps to the closest one.
- Grid snap uses the current step increment.
- Collision mode: two options — **Block overlap** (an object cannot be dropped or dragged into another; it stops flush against the surface) and **Allow overlap** (current behaviour). A blocked move shows the contact face highlighted.
- Alignment feedback: when the dragged object's center, edges or faces line up with another object on any axis, a coloured guide line runs between them and the value readout turns green with a light haptic/tone. A short "aligned on X/Y/Z" tag appears.

## 6. Increment dragging

Drag moves in a preset increment (set in the Move/Edit strip with the decimal toggle and slider) rather than freely — the object hops step by step. Setting the increment to 0 restores free dragging.

## 7. Object motion

New Motion strip for a selected object:
- Path: linear along an axis or vector, orbit around a point, or oscillate between two points.
- Controls: speed, acceleration/easing curve, distance or angle, pause duration at each end, and repeat/loop or ping-pong.
- Play/pause/reset for the whole scene; motion is stored on the object and saved with the scene, so reloading keeps it.

## Technical notes

- Cut: `CutOp` gains explicit `depth` and face-normal-derived rotation; `geometryOf` validates the boolean result (triangle count > 0) before accepting it, otherwise it falls back to the pre-cut geometry and reports failure. 2D cutter kinds get `extrude = depth`.
- Snapping/collision: reuse `snapPointsFor`/`nearestSnapPoint` from `state.ts`, plus world `Box3` overlap tests for the block-overlap mode with a push-out along the smallest penetration axis.
- Alignment guides drawn as scene lines when axis deltas fall under a tolerance tied to the current step.
- UI: `CadApp.tsx` is restructured around a `category` state driving a single bottom strip; existing panels are broken into small strip components.
- Motion runs in `useFrame` from a per-object `motion` descriptor; positions are simulated for display and the stored base position is unchanged, so editing still works.
- Speed and increment preferences persist in local storage alongside scene prefs.
