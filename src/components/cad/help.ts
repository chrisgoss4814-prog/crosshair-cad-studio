/** Plain-language descriptions for every control, shown on long-press and in
 *  the Guide sheet. */
export type HelpEntry = { title: string; body: string };

export const HELP: Record<string, HelpEntry> = {
  // Navigation
  nav: {
    title: "Move mode",
    body: "Gesture: swipe anywhere to fly that way — up/down/left/right — and hold your finger away from where you started to keep flying. Pinch moves only forward and back. Sticks: classic twin joysticks instead.",
  },
  look: {
    title: "Look stick",
    body: "Turns the camera in place, like turning your head. It pivots where you stand — it does not orbit around a distant point.",
  },
  lift: {
    title: "Up / Down",
    body: "Rises or drops straight along the world Y axis without changing where you are looking.",
  },
  speed: {
    title: "Speed",
    body: "Master travel speed for swipes and sticks. Lower it for careful work near small parts.",
  },
  fine: {
    title: "Fine mode",
    body: "Slows every movement to the 'slow at' percentage so you can line things up precisely. Tap again to return to full speed.",
  },
  depth: {
    title: "Depth",
    body: "How far in front of the camera the placement point floats when nothing is under the crosshair.",
  },

  // Views
  view: {
    title: "Views",
    body: "Fly is first-person. Orbit spins around the model. Top is a flat overhead drafting view.",
  },
  focus: {
    title: "Focus",
    body: "Glides the camera to look straight at the current selection. Double-tapping the scene does the same thing.",
  },

  // Placing
  place: {
    title: "Add",
    body: "Drops the current shape at the placement point — the spot where the axis lines cross. With Confirm on, the first tap shows a ghost preview and the second tap commits it.",
  },
  repeat: {
    title: "Repeat",
    body: "Places another copy of the last object one full width beside it, for laying bricks or courses quickly.",
  },
  recent: {
    title: "Recent shapes",
    body: "The last few shape setups you placed. Tap one to reload its size, sides, curve and bend.",
  },
  confirm: {
    title: "Confirm placement",
    body: "Two-step placing: arm first, check the ghost, then commit. Prevents accidental drops.",
  },
  shapeKind: {
    title: "Shape",
    body: "Pick a 3D solid or a flat 2D profile. A 2D profile becomes solid once you give it an extrude height.",
  },
  extrude: {
    title: "Extrude",
    body: "Gives a flat 2D shape thickness, turning an outline into a solid.",
  },
  stretchLock: {
    title: "Uniform / Free",
    body: "Uniform keeps one size for all three axes. Free lets you set X, Y and Z separately to stretch the shape.",
  },
  bend: {
    title: "Bend",
    body: "Curves the shape around the chosen axis. Negative values bend the other way.",
  },
  taper: {
    title: "Taper",
    body: "Shrinks one end of the shape toward a point, like a wedge or a spire.",
  },
  step: {
    title: "Step",
    body: "The decimal increment every − / + button and slider detent uses: 0.001, 0.01, 0.1, 1 or 10.",
  },

  // Snapping and collision
  gridSnap: {
    title: "Snap",
    body: "With Snap on, the ghost block at the screen center hops in whole-block steps the size of the shape itself, so everything you place lines up edge-to-edge like Minecraft. With Snap off it glides freely.",
  },
  clearHud: {
    title: "Clear screen",
    body: "Hides every button and panel so you see only the world, the axis lines and the ghost block. Add still works, and a small Show button or a three-finger tap brings the controls back.",
  },
  shapeSnap: {
    title: "Shape snap",
    body: "Pulls the placement point to nearby corners, edge midpoints and face centers of existing objects.",
  },
  solid: {
    title: "Solid / Ghost",
    body: "Solid makes objects physically block one another — a moved object stops at the surface it hits and slides along it. Ghost lets shapes pass through and overlap freely.",
  },
  faceAlign: {
    title: "Face alignment",
    body: "How a new shape lines up across the face you tapped. Center puts it dead center on that face, so equal shapes stack flush on all sides. Flush min / max butt it against one edge of the face instead — handy for laying bricks from a corner.",
  },
  guides: {
    title: "Align guides",
    body: "Draws lines when the selection lines up with another object, and reports which axes match.",
  },
  magnet: {
    title: "Magnet",
    body: "Softly pulls a dragged object into perfect alignment — matching centers, flush faces or butt joints — when it gets close.",
  },
  tapTarget: {
    title: "Tap target",
    body: "Tap any face to set the next placement spot. The new shape rests on that surface instead of sinking into it. Tap the same spot again, or use this chip, to clear it.",
  },
  dragBy: {
    title: "Drag by",
    body: "Drag increments. 0 is free dragging; any other value makes objects hop in exact steps of that size.",
  },
  dragPlane: {
    title: "Drag plane",
    body: "Face drags across the plane you are facing. Horz keeps drags flat on the ground plane.",
  },

  // Editing
  multi: {
    title: "Multi select",
    body: "Tapping objects adds them to the selection instead of replacing it.",
  },
  boxSelect: {
    title: "Box select",
    body: "Drag a rectangle on screen to select everything inside it.",
  },
  dup: { title: "Duplicate", body: "Copies the selection slightly offset from the original." },
  group: { title: "Group", body: "Binds the selection so they move and rotate together." },
  ungroup: { title: "Ungroup", body: "Releases grouped objects back to individuals." },
  join: { title: "Join", body: "Fuses the selected solids into one merged object (boolean union)." },
  sub: { title: "Subtract", body: "Cuts later selected objects out of the first one (boolean subtract)." },
  del: { title: "Delete", body: "Removes the selected objects." },
  rotate: { title: "Rotate", body: "Spins the selection around X, Y or Z by the chosen rotation step." },
  stretchAxes: {
    title: "Stretch",
    body: "Scales the selection on one axis at a time so you can flatten, lengthen or thin a shape.",
  },
  profile: {
    title: "Profile",
    body: "Reshapes the object's cross-section using a 2D outline while keeping its length.",
  },

  // Cutting
  cut: {
    title: "Cut",
    body: "Tap a face, size the cutter with width / height / depth, then Apply cut to punch that hole. The cutter is a real shape, so a hole never removes more than its own volume.",
  },
  uncut: { title: "Undo cut", body: "Restores the last object to how it looked before its cut." },

  // Motion
  motion: {
    title: "Motion",
    body: "Animates the selection: linear travel, back-and-forth oscillation, or an orbit. Set distance, speed, acceleration and how long it pauses at each end.",
  },

  // Other
  measure: {
    title: "Measure",
    body: "Mark two points to read the straight-line distance and the X/Y/Z differences between them.",
  },
  style: { title: "Style", body: "Colour, metalness and roughness for new and selected objects." },
  ai: {
    title: "AI builder",
    body: "Describe what to build and it uses the same tools to construct it. Keep or Undo the result; your style notes carry into future builds.",
  },
  files: { title: "Files", body: "Save, load and delete named scenes in this browser." },
  undo: { title: "Undo", body: "Removes the most recently placed object." },

  // Sketch lines
  line: {
    title: "Line tool",
    body: "Draws connected line segments in 3D. Tap a surface or use + Point to drop each point; close the loop back on the first point to fill or extrude it.",
  },
  linePoint: {
    title: "Add point",
    body: "Drops a sketch point where the axis lines cross, using the same snapping as tapping a surface.",
  },
  lineUndo: {
    title: "Undo point",
    body: "Removes the last point you placed in the line you are drawing.",
  },
  lineFinish: {
    title: "Finish line",
    body: "Ends the current line and keeps it as an editable open path.",
  },
  lineSnap: {
    title: "Line snapping",
    body: "Chooses what pulls a new point into place: other line ends, segment midpoints, solid corners and faces, or the grid with a 15° angle lock.",
  },
  lineCurve: {
    title: "Curve segment",
    body: "Turns the selected straight segment into a bezier curve with two draggable handles. Tap again to straighten it.",
  },
};


export const HELP_ORDER: string[] = [
  "nav",
  "look",
  "lift",
  "speed",
  "fine",
  "depth",
  "view",
  "focus",
  "place",
  "line",
  "linePoint",
  "lineUndo",
  "lineFinish",
  "lineSnap",
  "lineCurve",

  "repeat",
  "recent",
  "confirm",
  "shapeKind",
  "extrude",
  "stretchLock",
  "bend",
  "taper",
  "step",
  "gridSnap",
  "clearHud",
  "shapeSnap",
  "solid",
  "guides",
  "magnet",
  "tapTarget",
  "dragBy",
  "dragPlane",
  "multi",
  "boxSelect",
  "dup",
  "group",
  "ungroup",
  "join",
  "sub",
  "del",
  "rotate",
  "stretchAxes",
  "profile",
  "cut",
  "uncut",
  "motion",
  "measure",
  "style",
  "ai",
  "files",
  "undo",
];
