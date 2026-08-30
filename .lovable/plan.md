# Plan: Precision Controls & General Polish

## Part 1 — More precise, human-friendly controls

1. **Precision mode toggle ("Fine")** — a single button that drops ALL movement, rotation, and drag speed to ~15% while held or toggled. One tap to go precise, one tap back. Far easier than hunting for individual sliders mid-task.

2. **Detent sliders (step snapping on sliders)** — sliders snap to round values (0.25, 0.5, 1.0, 5.0…) as you drag, with haptic-like tick marks shown. A long-press on the slider switches to free/smooth drag. Sliders keep the existing −/+ decimal steppers for exact entry.

3. **Tap-to-type number entry** — tapping any numeric readout (coordinates, size, rotation) opens a numeric keypad so you can type the exact value instead of sliding.

4. **Nudge arrows** — a small 4-way arrow pad (+ up/down pair) that moves the selected object by exactly the current drag increment per tap. Pixel-perfect placement without dragging.

5. **Deadzone + ramp on joysticks** — small center deadzone so sticks don't drift, and an easing curve so small deflections are slow/precise and full deflection is fast. Speed slider still scales everything.

6. **Tap-to-place confirmation** — when placing, a preview ghost + "Place here / Cancel" chip appears, so a mistimed tap never drops an object in the wrong spot. (Optional in Settings.)

7. **Gesture polish** — two-finger pan speed matched to zoom level (so panning feels 1:1 with your fingers), momentum/inertia with friction on swipe rotate, and double-tap to recenter the view on the selected object.

## Part 2 — General app improvements

1. **Quick-bar of recent shapes** — last 4 used shapes/sizes as one-tap chips, so repeating a brick pattern takes one tap per brick.

2. **Copy-last / repeat-place** — a "Repeat" button that places another copy of the last object offset by its own size (instant brick-laying rhythm).

3. **Alignment smart-guides upgrade** — when alignment guides fire, also snap softly (magnetic snap within a small threshold) instead of only showing lines.

4. **Selection improvements** — tap empty space to deselect, long-press an object for a radial quick menu (duplicate, delete, edit, motion), and a highlight pulse so it's obvious what's selected.

5. **Object list / outliner** — a panel listing all placed objects by name; tap to select, eye icon to hide, trash to delete. Essential once scenes grow past ~20 objects.

6. **Undo/Redo history** — full multi-step undo/redo (currently single undo) covering place, delete, edit, and drag.

7. **Onboarding hint overlay** — first-run coach marks: "Left stick moves, right stick turns, swipe also works, tap an object to build on it." Dismissible and re-openable from Settings.

8. **Performance guard** — cap pixel ratio on small screens and auto-simplify far-away geometry so big scenes stay smooth on phones.

## Technical notes
- No new dependencies; all changes build on existing state (controls, drag increments, snap settings).
- Precision mode = a global multiplier in `state.ts` controls; detents = slider wrapper; nudge pad = new HUD row in Edit category.
- Undo history = snapshot stack of the placed-objects array (small, serializable).
- Outliner = read-only list over existing objects state.

## Suggested build order
1. Precision mode + deadzone/ramp + detent sliders (biggest feel win)
2. Tap-to-type entry + nudge pad
3. Quick-bar + Repeat + magnetic alignment snap
4. Outliner + multi-step undo
5. Gestures polish + onboarding + performance guard

Approve to build all of Part 1 + items 1–4 of Part 2, or tell me which items to trim.
