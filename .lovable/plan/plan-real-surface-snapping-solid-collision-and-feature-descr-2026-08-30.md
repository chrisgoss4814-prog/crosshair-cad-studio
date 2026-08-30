# Plan: Real surface snapping, solid collision, and feature descriptions

## 1. Tap-a-face then Add = snap to the outside surface

Today, tapping an object's face stores that exact surface point and Add drops the new
object *centered* on it, so half of it sinks into the object it should sit on.

Fix: when a tap target is set, offset the placement point outward along the tapped
face's normal by half of the new object's real extent along that direction (using its
actual stretched/extruded bounds, not the legacy uniform size). So:

- Tap the top of a cylinder, Add -> new cylinder sits exactly on top (pillars).
- Tap the side of a box, Add -> new box butts flush against that side (bricks).
- The ghost preview shows the same resting position before you commit, and coordinates
  in the readout match where it will land.
- Grid snap, when on, only rounds the two axes *across* the face, never the axis
  pushing away from it, so the contact stays perfectly flush.
- After placing, the tap target advances to the new object's outer face so repeated
  Add presses keep stacking in the same direction.

Same offset logic is applied to the crosshair-based (no tap) face placement so both
paths behave identically.

## 2. "Block overlap" becomes true solid collision

Today, "Block overlap" only refuses a whole drag step when the result overlaps, which
feels like the object freezes or jumps. What you want is objects that physically can't
pass through each other.

Changes:

- Rename the chip to **Solid / Ghost** (Solid = objects block each other).
- Sliding contact: when a drag would push an object into another, resolve it per axis —
  the object keeps moving along the free axes and stops flush against the blocking
  surface on the contact axis, instead of the whole move being rejected. Dragging a box
  along a wall slides it along the wall and stops when it touches.
- Blocking applies everywhere, not just drags: joystick/nudge moves, arrow nudges,
  Repeat, Duplicate, and typed coordinate entry all get the same resolve-and-stop pass.
- A brief contact highlight on the object you bumped into, so it's obvious why movement
  stopped.
- Placement stays blocked with a toast when the spot is fully inside another object
  (unchanged), but resting flush against a surface is always allowed.

Contact is computed from world bounding boxes (same source as alignment guides), which
is fast and predictable on phones; rotated non-box shapes use their box, so contact is
their bounding envelope.

## 3. Explain what every control does (long-press to learn)

Long-pressing any HUD button, chip, or slider label shows a small popover with a plain
description and a one-line "how to use it".

- Works on every control: category tabs, Snap/Solid/Magnet chips, Fine mode, Focus,
  Repeat, drag step, cut fields, motion fields, view modes.
- Popover shows the control's name, what it does, and a short example.
- Tap anywhere to dismiss; long-press is non-destructive (it never triggers the button).
- A "Help" toggle in Settings turns on tap-for-description mode for anyone who finds
  long-press awkward, plus a "Controls guide" sheet listing everything in one scrollable
  list.

Long-press on a 3D object keeps its existing quick menu (Dup / Edit / Motion / Del).

## 4. New navigation: swipe to fly, pinch for depth, one stick to look

Replace the two-joystick setup with gesture movement plus a single look stick.

- **One-finger swipe = move in the screen plane.** Swipe up/down to rise and fall,
  left/right to slide sideways. Direction follows the swipe, speed follows how far you
  swiped.
- **Hold to keep going.** After the swipe, keeping your finger down holds the movement
  in that direction until you lift off; how far the finger sits from where it started
  sets the speed, so you can steer while holding.
- **Pinch = forward / back only.** Pinch out to move forward, pinch in to move back.
  No zoom-scaling, real camera travel along the view direction.
- **One joystick, look only.** A single stick (right side, position/side settable)
  rotates the view. It pivots in place — yaw and pitch about the camera itself, no
  orbiting around a distant point, so the view spins and tilts like turning your head.
- Pitch is clamped just short of straight up/down so the horizon never flips.
- Fine mode, the speed sliders, deadzone and easing ramp all apply to the new gestures
  the same way they applied to the sticks.
- Object drag and tap-to-target still take priority when the gesture starts on an
  object, so building is unaffected.
- Old twin-stick mode stays available as a Settings option in case you want it back.

## Technical notes

- Placement offset uses `worldBoxOf`-style bounds of the pending shape projected onto
  the tapped normal, replacing the current `size / 2` assumption in `computeCenterPoint`
  and the tap-target branch in `Scene.tsx`.
- Collision resolve lives next to `boxesOverlap` in `state.ts` as a `resolveMove(box,
  delta, others)` helper returning the allowed delta per axis; `handleMove` and the
  nudge/duplicate paths call it.
- Descriptions live in one map keyed by control id, consumed by a shared `Hint` wrapper
  so no copy is duplicated across the HUD.
- Navigation: `FlyRig` gains a pointer-drag state feeding `controls.move`/`lift` from a
  held offset vector; pinch distance delta feeds forward/back; the right stick writes
  `controls.look` only and rotation is applied to the camera's own quaternion (yaw about
  world up, pitch about local right) so there is no orbital offset.

