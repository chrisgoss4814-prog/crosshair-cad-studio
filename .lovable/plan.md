# Face-perfect snapping and real solid blocking

## What's wrong today

- **Snap lands where you tapped, not centered.** Tapping a face stores the exact
  touch point and the new shape is only pushed outward along that face's normal
  (`computeCenterPoint` in `state.ts`, tap branch in `Scene.tsx`). Nothing lines
  the two shapes up sideways, so a cube stacked on a cube hangs over on the side
  you happened to tap.
- **Objects pass through each other by default.** Blocking only runs when the
  Solid chip is on, and that chip starts off (`blockOverlap` defaults to `false`
  in `CadApp.tsx`). Blocking also only runs on drag and nudge — placement of a
  new object, Repeat, Duplicate and typed coordinates don't get the same pass.

## 1. Face-aligned snapping for every shape

When you tap a face and press Add, the new object is aligned to the face it
lands on, not to your fingertip:

- **Along the face normal**: the new shape's surface touches the target's
  surface exactly (already works, kept).
- **Across the face**: the new shape's center lines up with the target face's
  center, so a cube on a cube is flush on all four sides, a cylinder on a
  cylinder makes a straight pillar, and a box against a wall butts squarely.
- **Different sizes**: when the shapes differ in footprint, the smaller one
  centers on the larger face by default. A small "Align" control in the Place
  strip switches between **Center**, **Flush min edge**, **Flush max edge** per
  cross axis so you can also line up bricks to a corner instead of the middle.
- **Grid snap** no longer fights this: with face alignment active, grid rounding
  is skipped on the two cross axes (it is what currently pushes shapes off the
  face center).
- **Rotation match**: the placed object inherits the target object's rotation so
  faces stay parallel, not twisted.
- Works for every shape in the toolbox because alignment is computed from the
  target's real face rectangle and the new shape's real extents, not from a
  hardcoded box assumption. Rounded shapes (sphere, cone, cylinder, 2D profiles,
  extrusions, cut shapes) use their true current bounds.
- The ghost preview shows the final aligned resting spot before you commit, and
  the readout shows the aligned coordinates.
- After placing, the tap target advances to the outer face of the new object, so
  repeated Add keeps building a perfectly aligned stack.

## 2. Solid bodies that actually block

- **Solid is the default.** The chip still lets you switch to Ghost when you
  want to overlap on purpose.
- Blocking is applied on **every** way an object can move: drag, joystick/nudge
  arrows, typed coordinates, Duplicate, Repeat, and placing a new object.
- Moves keep resolving axis by axis, so a blocked object **slides along** the
  surface it hit and stops flush instead of freezing or jumping.
- Continuous drags are swept from the last valid position rather than tested
  only at the new spot, so a fast drag can't tunnel straight through a thin
  wall — the current per-frame test is what lets fast drags skip through.
- Contact feedback: the blocking object flashes its contact face and the readout
  shows which axis is blocked.

## 3. Alignment feedback

- While dragging, when the moved object becomes flush or center-aligned with a
  neighbour, a guide line is drawn between them and the axis readout turns
  green.
- Magnetic align now also runs in Solid mode (today it is disabled whenever
  Solid is on), so you get snap-to-flush and blocking at the same time.

## Technical notes

- New helper in `state.ts`: `faceFrameFor(mesh, normal)` returns the tapped
  face's world center plus its two tangent axes; `alignAcrossFace` projects the
  pending shape's center onto that frame with the chosen center/min/max rule.
- `computeCenterPoint` and the `tapTarget` branch in `Scene.tsx` both route
  through the same helper so crosshair and tap placement behave identically.
- `resolveMove` gains a swept form (`resolveMoveSwept`) that subdivides the
  delta by the smallest blocker thickness before resolving, removing tunneling.
- `CadApp.tsx`: `blockOverlap` default flips to `true`; `wouldCollide` is
  replaced with a shared `applyMove` path used by drag, nudge, typed entry,
  duplicate, repeat and place.
- Alignment mode (`center | min | max`) stored alongside the place settings and
  persisted with prefs.
