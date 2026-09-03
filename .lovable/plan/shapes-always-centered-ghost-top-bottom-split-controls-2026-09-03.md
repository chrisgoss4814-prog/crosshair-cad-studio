# Shapes: always-centered ghost + top/bottom split controls

## 1. The toggled shape always sits front and center

- The preview shape stays locked to the center of the screen at all times, directly ahead of you at the current depth, no matter which tool or option is open.
- It turns with you: the ghost's yaw follows the direction you're facing, so a box always presents its face toward you instead of keeping a fixed world rotation.
- Tapping the face of an object no longer yanks the preview off-center. The tap only records the surface you want to snap to (highlighted on that object); the preview stays centered, and Add places it flush on the recorded face. Tapping empty space clears the recorded face as it does today.

## 2. Shapes controls move to the top and bottom edges

No control box in the middle. The Shapes tool splits into two slim edge strips:

```text
 top edge:  [ size X | size Y | size Z ]  [ digit x place-value ]
 left rail:  3D icons              right rail:  2D icons
 bottom edge: [ edge select | curve | angle | mirror | reset ] [ Advanced ] [ Add ]
```

- Top strip: the per-axis size steppers (−/value/+, tap value to type) plus the digit and decimal-place chips that set the step increment.
- Bottom strip: edge selection swipe row, curve and angle steppers, mirror/reset, the Advanced toggle, and the existing Add/Repeat row.
- Advanced (2D/3D toggle, extrude, sides, rotation) opens as a second thin line inside the bottom strip, not a panel.
- Both strips are one row tall, horizontally scrollable, and never exceed roughly 15% of screen height each. The whole middle band of the screen stays clear.

## Technical notes

- `src/components/cad/CadApp.tsx`: split the `stripBody()` `place` case into two renderers (`shapesTopStrip`, `shapesBottomStrip`); mount the top one under the existing top edge bar and the bottom one in the bottom edge stack, bypassing the shared `focused` panel container for `cat === "place"`.
- Ghost centering: stop using `tapTarget.point` as the ghost transform source; keep the ghost on the screen-center lattice and apply the recorded face only at Add time (reuse the existing flush-face alignment math). Keep the target-face highlight in `Scene.tsx`.
- Ghost orientation: derive yaw from the camera heading and pass it to the ghost mesh in `Scene.tsx` so it faces the viewer; placed objects keep the yaw they had when added.
- No changes to geometry, edge modifiers, collision, or persistence.
