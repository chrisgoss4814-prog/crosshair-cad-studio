# Keep the base a true square when bowing the upright lines

## What happens now

Curving the four upright lines of a cube bows them outward, but the bulge is forced to zero exactly at each line's ends. The corners are pinned, so the bow has to flatten out sharply right where it meets the base — that pinch is the distortion you see along the bottom edges, and the base never grows or shrinks with the curve.

## What it should do

- The base stays a perfect square (flat, straight edges, equal sides, right angles) at all times.
- When you bow the uprights outward, the base square grows; bowing inward shrinks it.
- The same rule applies to the top face and to any face whose own lines you never curved.

## How it will work

1. **Corners are allowed to move.** A curve no longer pins the line's endpoints. The bulge profile becomes a full bow plus a uniform end shift, so each corner moves outward (or inward) by the same fraction of the curve amount. Four uprights curved by the same amount therefore move all four corners equally — the base stays square and just changes size.
2. **Untouched faces are rebuilt clean.** After the curve is applied, every face whose boundary lines were not curved is regenerated from its four moved corners: the edges are set to straight lines and the interior points are re-spread evenly across the flat quad. This removes any residual pinching or bowing in the base and top.
3. **Untouched lines still only change length**, never shape — the existing re-straighten rule is kept and now runs after the corner shift.

## Technical notes

- `src/components/cad/edges.ts`, `applyEdgeMods`:
  - Replace the along-edge weight `1 - t²` with `(1 - END) * (1 - t²) + END` for non-loop edges (`END` ≈ 0.35), so endpoints receive a uniform share of the curve displacement instead of zero.
  - Keep the perpendicular falloff so the bulge doesn't drag distant geometry.
  - Add a planar-face restoration pass after the existing re-straighten pass: group vertices of the base geometry by shared plane (using original positions and normals), and for a face whose four boundary edges are all absent from the touched set, recompute each vertex as a bilinear blend of the face's four moved corners (using its original normalized position within the original face rect). This guarantees flat, straight, right-angled faces.
  - Face grouping is derived once from the original positions, so segmented geometry (box is 8×8×8) maps correctly.
- No changes to the shape model, UI, persistence, or collision.
