# Curved taper, saving AI builds, STL/OBJ import

## 1. Curved taper

Today taper is linear: slices shrink or grow in a straight cone. Add a **Curve** stepper beside Taper so the silhouette can bow instead of running dead straight.

- Range -1 … +1, shared increment, tap-to-type, reset chip.
- `0` = straight (today's behaviour), `+` = barrel/bulge, `-` = pinched waist.
- Label reads `straight` / `bulge` / `pinch`, matching the taper label style.
- Every horizontal slice keeps its own outline exactly — a square stays square, a circle stays circular; only slice size changes with height.
- Applies to the centered ghost/new shape and to a selected object; saved with the object.

## 2. Save toggle for AI-made objects

After the AI builds something, a **Keep** toggle appears in the AI strip.

- Toggle ON: the objects the AI just created are locked into the scene and written to the saved scene right away, so an undo/clear/reload won't lose them.
- Toggle OFF: they stay as a preview-style build that can still be undone in one step.
- A **Save as…** action next to it stores just those AI-created objects as a named part in a small local parts library, so the same build can be dropped into any scene later.
- The parts library is listed in the Files strip: tap a saved part to place it at the current center point.

## 3. Import STL / OBJ

New **Import** action in the Files strip opens the phone's file picker for `.stl` (binary + ASCII) and `.obj`.

- The imported mesh becomes a normal object in the scene: it can be moved, rotated, snapped, collided with, cut, saved with the scene, and exported.
- On import the mesh is centered and auto-scaled to a sane starting size, then placed at the current center point.
- Very large files are handled by showing a short "too large" message rather than freezing; a progress line shows while parsing.
- Import errors (bad or unsupported file) show a plain message and change nothing in the scene.

## Technical notes

- **Taper curve**: `applyTaper(geo, taper, curve)` in `geometry.ts` adds a symmetric mid-height term (`curve * 4 * u * (1 - u)`) to the per-slice scale, clamped to a small positive minimum. `GeometrySpec.taperCurve` added and folded into `specKey`; `PlacedObject.taperCurve` with `?? 0` hydration in `state.ts`; `taperCurve` state + `bumpTaperCurve` + stepper in `CadApp.tsx`.
- **AI keep/save**: `ai-build.functions.ts` results already produce `PlacedObject`s; track their ids in `CadApp` as `aiBatchIds`. Keep toggle commits the batch (clears it from the undoable batch list) and calls the existing autosave. New `parts-store` helpers in `src/lib/scene-store.ts` (`listParts` / `savePart` / `loadPart` / `deletePart`, `vectorbay:part:` prefix) storing objects relative to their batch centroid; placing re-offsets to `placePoint`.
- **Import**: add `three/examples/jsm/loaders/STLLoader` and `OBJLoader` (dynamic `import()` so they stay out of the initial bundle). Parsed `BufferGeometry` is merged, centered, normalized by bounding-box max extent, and stored as a new `PlacedObject` kind `"mesh"` whose geometry lives in an in-memory registry keyed by id, with the raw file text/base64 persisted alongside the scene so reloads rebuild it. `buildGeometry` returns the registry geometry for `kind === "mesh"` and skips edge mods/taper for it. Collision uses its bounding box like other solids.
