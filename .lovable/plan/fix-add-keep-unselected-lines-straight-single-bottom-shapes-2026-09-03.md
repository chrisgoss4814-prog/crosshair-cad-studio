# Fix Add, keep unselected lines straight, single bottom Shapes bar

## 1. Add actually places (confirmed cause)

Pressing Add in the live preview returns "Blocked — that spot overlaps another object". The centered ghost sits at a fixed depth ahead of you, so as soon as anything is in that spot, every Add is refused and it feels like the button is dead.

Fix:
- Add nudges the placement out of the way instead of refusing: if the centered spot overlaps, the new shape is pushed along the view direction (and then up) to the nearest free lattice spot and placed there.
- Only if no free spot is found nearby does it refuse, and the ghost turns red beforehand so you can see it is blocked before pressing.
- The block check ignores the object you tapped a face on (flush stacking always works).

## 2. Unselected edges never curve

Curving one edge currently drags nearby geometry, so lines you never picked bow out.

Fix: the bulge is confined to the picked edge's own span, and every edge you did not pick is snapped back onto the straight line between its (moved) corners — including short two-point edges and face interiors, which are re-flattened. Unselected lines only change length, never shape.

## 3. One slim Shapes bar at the bottom, with a close button

- The top Shapes strip goes away. All Shapes controls live in a single bar pinned to the bottom edge.
- The bar is one row tall and scrolls horizontally: size steppers, step digit/decimals, edge select, curve, angle, mirror, reset, Advanced, Add/Repeat.
- A `✕` close button on the bar closes Shapes and returns to the category bar; a `▾` collapses it to a thin handle.
- Maximum height stays under ~15% of the screen, so the middle of the view is always clear. Left/right shape icon rails stay as they are.

## Technical notes

- `src/components/cad/CadApp.tsx`: in `place()`, replace the hard `wouldCollide` refusal with a search over candidate offsets (forward/back along camera heading, then +Y) in lattice steps; keep the toast only when all candidates fail. Merge `shapesTopStrip()` into `shapesBottomStrip()` as one scrollable row, remove the `top-11` Shapes mount, and add close/collapse controls to the Shapes bar header.
- `src/components/cad/Scene.tsx`: tint the ghost when the current spot is blocked (reuse existing collision helper via a published flag).
- `src/components/cad/edges.ts`: in `applyEdgeMods`, gate the displacement weight by distance along the picked edge's own extent, and extend the re-straighten pass to all non-curved edges regardless of point count, plus a projection pass for vertices lying on unmodified faces.
- No geometry-kind, persistence, or collision-mode changes beyond the above.
