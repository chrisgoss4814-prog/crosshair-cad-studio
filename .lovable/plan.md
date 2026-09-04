# Curved taper

## What changes

Today taper is linear: the slices shrink or grow in a straight cone from base to top. Add a second control that bends that taper into a curve, so the silhouette can bulge out (barrel) or pinch in (vase/hourglass-style waist) instead of running dead straight.

## Controls (Shapes bar, next to Taper)

- **Taper** — unchanged: how much wider the top or base is.
- **Curve** — new stepper, -1 … +1, uses the shared increment.
  - `0` = straight sides (current behaviour)
  - `+` = sides bow outward (barrel / bulge)
  - `-` = sides pinch inward (waisted / concave)
- Label under the value reads `straight` / `bulge` / `pinch`, matching the existing taper label style.
- A reset chip sets curve back to 0.

Every horizontal slice still keeps its own outline exactly — a square stays a square, a circle stays a circle. Only the slice's size changes along the height.

## Behaviour

- Works on the centered ghost/new shape and on an already-selected object, like taper does.
- Saved with the object and persisted, so scenes reload with the curved profile.
- Curve with taper at 0 gives a symmetric barrel or waist; combined with taper it gives a curved cone.

## Technical notes

- `geometry.ts`: `applyTaper` gains a `curve` argument. The height fraction `u = (y - y0) / h` is remapped with a smooth easing before the scale is computed, and an extra symmetric term `curve * 4 * u * (1 - u)` is added to the slice scale so mid-height bulges or pinches while the two ends stay put. Scale is still clamped to a small positive minimum.
- `GeometrySpec` gains `taperCurve?: number`; included in `specKey` so the geometry cache keys correctly.
- `state.ts`: `PlacedObject.taperCurve` with default `0` and hydration fallback (`o.taperCurve ?? 0`).
- `CadApp.tsx`: `taperCurve` state + `bumpTaperCurve`, threaded into the ghost spec, the Add path, and `updateSelected`; new stepper rendered beside the existing taper stepper in the bottom Shapes bar.
