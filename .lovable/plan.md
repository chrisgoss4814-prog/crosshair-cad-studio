# Shapes tool: icon picker + edge-length editing

## 1. Rename

"Place" becomes **Shapes** everywhere in the toolbar and help text.

## 2. Shape icons at the top of the screen

The text chips move out of the bottom strip and become a shape bar pinned at the top:

- Row 1: **3D** — box, sphere, cylinder, cone, prism, torus, wedge, etc.
- Row 2: **2D** — rectangle, circle, ellipse, polygon, star, triangle, arc.
- Each shape is a small drawn icon (real outline of the shape, not a letter), tap to arm it. The active shape lights up.
- Rows are horizontally scrollable, labelled `3D` and `2D` on the left, and only appear while the Shapes tool is open. In Clear mode they hide with the rest of the HUD.

## 3. No sliders — edge lengths with steppers

The size sliders are removed. Instead the strip lists the **edges of the shape you have selected**, each with its own value you can change:

```text
edge          value        controls
width  X      1.000 m      [ − ] [ 1.000 ] [ + ]
depth  Z      1.000 m      [ − ] [ 1.000 ] [ + ]
height Y      1.000 m      [ − ] [ 1.000 ] [ + ]
```

- Each row is a large −/+ pair around the number; one tap moves exactly one increment.
- The number itself is tappable to type an exact value.
- A **Link** toggle makes all edges move together (uniform), off by default.
- Edge names follow the shape: a cylinder shows `radius` and `height`, a cone shows `base radius` and `height`, a rectangle shows `width` and `length`, a polygon shows `edge length` and `sides`.
- The same edge rows appear for an already-placed object when it is selected, so editing a built object uses the identical control.

## 4. Increment control: digit + decimal place

One shared increment picker replaces the old step chips:

```text
increment   [1][2][3][4][5][6][7][8][9]   ×  [10] [1] [0.1] [0.01] [0.001]
                     ^ digit                        ^ decimal place
```

The active increment is `digit × place` (e.g. `3 × 0.01 = 0.03`) and is shown live next to the −/+ buttons. It applies to every stepper in the open strip — edge lengths, extrude, rotation and drag increment.

## 5. Options: only what applies

The always-on rows for sides, curve, bend, taper and bend axis are removed from the main strip.

- **Sides** shows only for polygon/prism/star shapes, as a −/+ row.
- **Extrude** shows only for 2D shapes (turns a flat profile into a solid).
- **Curve, bend, taper, bend axis** move behind a single **Advanced** button in the strip; opening it shows them as the same −/+ stepper rows, never as sliders.

## 6. Kept as-is

Add / Place-here button, Repeat, recent-shape quick bar, Confirm toggle, snapping and collision behaviour, and the ghost at screen centre are unchanged.

## Technical notes

- New `ShapeBar` component rendered above the canvas HUD, driven by `SHAPES_3D` / `SHAPES_2D` from `geometry.ts`; icons are inline SVG outlines keyed by `ShapeKind`.
- New `Stepper` component (label, value, −/+, tap-to-type) replaces `NumRow`/`Slider` usage inside the Shapes strip.
- New `increment` state = `digit * place`, persisted with the existing control prefs (`vb.controls.v1`); `STEPS` in `state.ts` stays for backwards compatibility with saved prefs.
- An `edgesFor(kind)` descriptor maps each `ShapeKind` to its named editable dimensions and which of them bind to `scale[0..2]`, `sides`, or `extrude`, so one strip serves both placement and selected-object editing.
- `CATS` entry `place` keeps its id (saved prefs unaffected) and only its label changes to `Shapes`.
