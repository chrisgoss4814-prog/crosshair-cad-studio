# Minecraft-style center block placement

## What changes

The pending shape becomes a persistent "ghost block" locked to the middle of
the screen that moves with you in whole-block steps, so everything you place
lines up like Minecraft — just with the full shape library.

- **Always-on center block.** The ghost shape is always drawn at the screen
  center, at a fixed distance in front of the camera, in every view mode. It
  follows you as you fly, never runs off to a surface on its own, and never
  disappears.
- **Snap on = block-sized steps.** With Snap on, the ghost's position is
  quantized to a lattice whose cell size is the ghost's own size on each axis
  (its stretched width, height and depth), not a fixed 0.5m grid. Move around
  and the ghost hops one block at a time, so a 1x1x1 cube lands on a 1m
  lattice, a 2x0.5x1 beam lands on a 2 / 0.5 / 1 lattice.
- **Everything lines up.** Because the lattice is anchored to the world origin
  (offset by half a block so blocks sit face-to-face), two blocks of the same
  size placed anywhere are automatically edge-to-edge and right-angled with no
  overhang — a wall of cubes tiles perfectly.
- **Different sizes still cooperate.** Changing size re-derives the lattice, so
  a half-size block snaps to half-steps that still align with the big blocks'
  faces.
- **Add places exactly what you see.** Pressing Add drops the object at the
  ghost's shown position and rotation, with no extra snapping at commit time.
- **Snap off = free movement.** With Snap off the ghost glides continuously at
  the same screen-center distance, for fine or off-grid work.
- **Face tap still overrides.** Tapping the face of an existing object parks the
  ghost flush and aligned on that face (current face-align behaviour kept).
  Tapping the same face again, or empty space, releases it back to the screen
  center lattice.
- **Face-snapped blocks ignore passers-by.** While parked on a tapped face, the
  ghost may overlap other objects — Solid-mode blocking does not shove it.
  Blocking resumes normally once the object is placed and moved.
- **Depth control stays.** The distance of the ghost from you is still set by
  the depth/elevation controls; it just quantizes to the same lattice.

## Technical notes

- `computeCenterPoint` (`src/components/cad/state.ts`): remove the surface-hit
  and ground-plane branches; always take the camera-forward point at `depth`,
  then quantize per axis with a new `snapToLattice(point, cell)` helper where
  `cell = 2 * half` (the ghost's per-axis full extent, minimum guarded) and the
  lattice is offset by `half` so cells butt face-to-face. Falls back to the
  fixed grid when the ghost has no meaningful extent.
- `CenterProbe` (`src/components/cad/Scene.tsx`) already computes `half` from
  the ghost geometry and stretch; pass it through as the cell size. Tap-target
  branch unchanged.
- `Ghost` renders unconditionally except while a cut preview or sketch draft
  owns the center.
- `CadApp.tsx`: Add uses the published center directly; tapping empty space
  clears `tapTarget`; Solid-mode resolve is skipped for the face-parked ghost.
