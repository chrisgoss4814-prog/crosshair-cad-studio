# Center block that stays put until you tap a face

## What changes

Right now the pending shape at the screen center jumps around: it snaps onto
whatever object or ground the center of the screen happens to look at, and it
hides in some modes. You want a single, always-visible block locked to the
middle of the screen that goes exactly where it sits when you press Add.

- **Always-on center block.** The ghost shape is always drawn at the screen
  center at a fixed distance in front of the camera, in every view mode. It
  moves with you as you fly, never runs off to a surface on its own, and never
  disappears.
- **Add places it exactly there.** Pressing Add drops the object at the block's
  current position and rotation — the position shown in the readout matches
  what you see, with no extra snapping applied at commit time.
- **Face placement is opt-in only.** The only way the block leaves the screen
  center is tapping the face of an existing object. Then it hops onto that
  face, aligned and flush (current face-align behaviour kept). Tapping the same
  face again, or tapping empty space, releases it back to the screen center.
- **Depth control stays.** The distance of the block from you is still set by
  the depth/elevation controls, so you can push it further out or pull it in.
- **Grid snap becomes a choice, not a hijack.** With Snap on, the center block's
  coordinates are rounded to the grid but it stays on the center ray — it no
  longer leaps to the ground plane or to a surface under the crosshair.

## Technical notes

- `computeCenterPoint` (`src/components/cad/state.ts`): drop the surface-hit and
  ground-plane branches from the default path; always return the camera-forward
  point at `depth`, optionally grid-rounded. Face-snap logic (`alignOnFace`) is
  kept and used only via `tapTarget`.
- `CenterProbe` (`src/components/cad/Scene.tsx`): unchanged tap-target branch;
  the fallback branch now just publishes the fixed forward point.
- `Ghost` in `Scene.tsx` renders unconditionally (except while a cut preview or
  sketch draft owns the center), so the block is always present.
- `CadApp.tsx`: Add uses the published center directly; tapping empty space
  clears `tapTarget` so the block returns to center.
