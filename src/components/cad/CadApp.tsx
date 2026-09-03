import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,

} from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Joystick } from "./Joystick";
import { ShapeBar } from "./ShapeBar";
import { HELP, HELP_ORDER } from "./help";
import { Scene, type CutPreview } from "./Scene";
import {
  edgesOf,
  is2D,
  SHAPES_2D,
  SHAPES_3D,
  type EdgeMod,
  type GeometrySpec,
  type Shape2D,
  type ShapeKind,
} from "./geometry";
import {
  alignmentsFor,
  centerPoint,
  placePoint,
  ghostYaw,
  centroid,
  cloneObject,
  controls,
  DEFAULT_MATERIAL,
  DEFAULT_MOTION,
  geometryOf,
  hydrateObject,
  magneticAlign,
  makeObject,
  boxesOverlap,
  requestFlyFocus,
  nearestSnapPoint,
  resolveMove,

  resolveMoveSwept,
  sceneRefs,
  selectionFocusState,
  SNAP,
  STEPS,
  SWATCHES,
  tapTarget,
  type AlignMode,
  worldBoxOf,
  type CutOp,
  type DragPlaneMode,
  type Material,
  type MotionMode,
  type MotionSpec,
  type PlacedObject,
  type ToolMode,
  type ViewMode,
} from "./state";
import {
  autoSave,
  autoSaveSketches,
  deleteScene,
  deleteSketches,
  listScenes,
  loadAuto,
  loadAutoSketches,
  loadScene,
  loadSketches,
  saveScene,
  saveSketches,
} from "@/lib/scene-store";
import {
  cloneSketch,
  DEFAULT_SKETCH_SNAP,
  defaultHandles,
  getSketchLabel,
  hydrateSketch,
  makeSketch,
  mirrorHandle,
  movePoint,
  resolveSketchPoint,
  
  sketchCursor,
  sketchLength,
  subscribeSketchLabel,
  translateSketch,
  v as vec,
  type Sketch,
  type SketchSnapPrefs,
  type Vec3,
} from "./sketch";
import { aiBuild, type BuildStep } from "@/lib/ai-build.functions";

import {
  DEFAULT_PREFS,
  examplesPrompt,
  loadPrefs,
  prefsPrompt,
  recordExample,
  savePrefs,
  type BuilderPrefs,
} from "@/lib/ai-memory";
import { toast } from "sonner";

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "fly", label: "Fly" },
  { id: "orbit", label: "Orbit" },
  { id: "top", label: "Top" },
];

type Cat =
  | "move"
  | "place"
  | "line"
  | "edit"
  | "stretch"
  | "cut"
  | "snap"
  | "motion"
  | "style"
  | "measure"
  | "ai"
  | "files";

const CATS: { id: Cat; label: string; tool: ToolMode | null }[] = [
  { id: "move", label: "Move", tool: null },
  { id: "place", label: "Shapes", tool: "place" },
  { id: "line", label: "Line", tool: "line" },
  { id: "edit", label: "Edit", tool: "edit" },
  { id: "stretch", label: "Size", tool: "edit" },
  { id: "cut", label: "Cut", tool: "cut" },
  { id: "snap", label: "Snap", tool: null },
  { id: "motion", label: "Motion", tool: "edit" },
  { id: "style", label: "Style", tool: null },
  { id: "measure", label: "Meas", tool: "measure" },
  { id: "ai", label: "AI", tool: null },
  { id: "files", label: "Files", tool: null },
];

const CAT_HELP: Record<string, string> = {
  move: "nav",
  place: "place",
  line: "line",
  edit: "multi",
  stretch: "stretchAxes",
  cut: "cut",
  snap: "solid",
  motion: "motion",
  style: "style",
  measure: "measure",
  ai: "ai",
  files: "files",
};


const ROT_STEPS = [1, 5, 15, 90];
const PREFS_KEY = "vb.controls.v1";

/** Long-press any control to read what it does. */
const HintCtx = createContext<(id: string) => void>(() => {});

function useHint(hint?: string) {
  const show = useContext(HintCtx);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  if (!hint) return {} as Record<string, never>;
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        show(hint);
      }, 500);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}

function Chip({
  active,
  onClick,
  children,
  className = "",
  hint,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}) {
  const hintProps = useHint(hint);
  return (
    <button
      type="button"
      onClick={onClick}
      {...hintProps}
      className={`rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
        active
          ? "border-accent bg-accent/20 text-foreground shadow-glow"
          : "border-grid-line bg-panel/80 text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Btn({
  onClick,
  children,
  className = "",
  disabled,
  hint,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const hintProps = useHint(hint);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...hintProps}
      className={`rounded-md border border-grid-line bg-panel/85 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground backdrop-blur-md transition-colors hover:border-accent/70 disabled:opacity-35 ${className}`}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      <span className="w-14 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-accent"
      />
      <span className="w-11 shrink-0 text-right text-foreground">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </label>
  );
}

/** A readout you can tap to type an exact value. */
function EditableValue({
  value,
  decimals = 3,
  unit = "",
  onCommit,
  className = "",
}: {
  value: number;
  decimals?: number;
  unit?: string;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    const commit = (raw: string) => {
      const v = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(v)) onCommit(v);
      setEditing(false);
    };
    return (
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        step="any"
        defaultValue={+value.toFixed(6)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={(e) => commit(e.target.value)}
        className={`rounded border border-accent bg-background/80 px-1 text-right font-mono text-[11px] outline-none ${className}`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Tap to type an exact value"
      className={`text-right font-mono text-[11px] underline decoration-dotted decoration-muted-foreground/60 underline-offset-2 ${className}`}
    >
      {value.toFixed(decimals)}
      {unit}
    </button>
  );
}

/** Slider + stepper that always moves in the active decimal step.
 *  Long-press the slider for a smooth (detent-free) drag; tap the number to
 *  type an exact value. */
function NumRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit = "m",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  const [free, setFree] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clamp = (v: number) =>
    Math.min(max, Math.max(min, +v.toFixed(6)));
  const decimals = step < 0.01 ? 3 : step < 1 ? 2 : 2;

  const startHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setFree(true), 450);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setFree(false);
  };

  return (
    <div className="mb-1 flex items-center gap-1.5">
      <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <Btn onClick={() => onChange(clamp(value - step))}>−</Btn>
      <input
        type="range"
        min={min}
        max={max}
        step={free ? (max - min) / 1000 : step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onPointerLeave={endHold}
        className={`min-w-0 flex-1 accent-accent ${free ? "opacity-80" : ""}`}
      />
      <Btn onClick={() => onChange(clamp(value + step))}>+</Btn>
      <EditableValue
        value={value}
        decimals={decimals}
        unit={unit}
        onCommit={(v) => onChange(clamp(v))}
        className="w-16 shrink-0"
      />
    </div>
  );
}

export function CadApp() {
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [view, setView] = useState<ViewMode>("fly");
  const [tool, setTool] = useState<ToolMode>("place");
  const [cat, setCat] = useState<Cat | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sticks, setSticks] = useState(true);
  const [nav, setNav] = useState<"gesture" | "swipe-look">("gesture");
  const [helpId, setHelpId] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const placeHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeFired = useRef(false);
  const [kind, setKind] = useState<ShapeKind>("box");
  const [size, setSize] = useState(1);
  const [stretch, setStretch] = useState<[number, number, number]>([1, 1, 1]);
  const [lockStretch, setLockStretch] = useState(true);
  const [sides, setSides] = useState(6);
  const [extrude, setExtrude] = useState(0);
  const [edgeMods, setEdgeMods] = useState<EdgeMod[]>([]);
  const [selEdges, setSelEdges] = useState<number[]>([]);
  const [mirrorEdges, setMirrorEdges] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [digit, setDigit] = useState(1);
  const [places, setPlaces] = useState(1);
  const [step, setStep] = useState(0.1);
  const [rotStep, setRotStep] = useState(90);
  const [depth, setDepth] = useState(6);
  const [snap, setSnap] = useState(true);
  const [shapeSnap, setShapeSnap] = useState(true);
  const [blockOverlap, setBlockOverlap] = useState(true);
  const [alignMode, setAlignMode] = useState<AlignMode>("center");
  const [showGuides, setShowGuides] = useState(true);
  const [dragStep, setDragStep] = useState(0);
  const [material, setMaterial] = useState<Material>(DEFAULT_MATERIAL);
  const [dragPlane, setDragPlane] = useState<DragPlaneMode>("horizontal");
  const [clearHud, setClearHud] = useState(() => {
    try {
      return localStorage.getItem("vectorbay:clearHud") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("vectorbay:clearHud", clearHud ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [clearHud]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [boxSelect, setBoxSelect] = useState(false);
  const [measureA, setMeasureA] = useState<[number, number, number] | null>(null);
  const [measureB, setMeasureB] = useState<[number, number, number] | null>(null);
  const [tapPoint, setTapPoint] = useState<[number, number, number] | null>(null);
  const [speed, setSpeed] = useState(1);
  const [moveMul, setMoveMul] = useState(1);
  const [lookMul, setLookMul] = useState(1);
  const [liftMul, setLiftMul] = useState(1);
  const [precision, setPrecision] = useState(false);
  const [precisionLevel, setPrecisionLevel] = useState(0.2);
  const [playing, setPlaying] = useState(true);
  const [confirmPlace, setConfirmPlace] = useState(false);
  const [armed, setArmed] = useState(false);
  const [magnet, setMagnet] = useState(true);
  const [lastPlacedId, setLastPlacedId] = useState<string | null>(null);
  const [quickMenu, setQuickMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  type RecentSpec = {
    kind: ShapeKind;
    size: number;
    stretch: [number, number, number];
    sides: number;
    extrude: number;
    edges: EdgeMod[];
  };
  const [recent, setRecent] = useState<RecentSpec[]>([]);

  // Cut tool
  const [cutW, setCutW] = useState(0.5);
  const [cutH, setCutH] = useState(0.5);
  const [cutDepth, setCutDepth] = useState(0.5);
  const [cutPick, setCutPick] = useState<{
    objectId: string;
    point: [number, number, number];
    normal: [number, number, number];
  } | null>(null);

  const measureRef = useRef<{
    a: [number, number, number] | null;
    b: [number, number, number] | null;
  }>({ a: null, b: null });
  const [sceneName, setSceneName] = useState("");
  const [scenes, setScenes] = useState<string[]>([]);
  const [rect, setRect] = useState<null | {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }>(null);
  const rectActive = useRef(false);

  // AI state
  const [prompt, setPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSteps, setAiSteps] = useState<BuildStep[]>([]);
  const [aiIds, setAiIds] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<BuilderPrefs>(DEFAULT_PREFS);
  const beforeAi = useRef<PlacedObject[] | null>(null);
  const lastPrompt = useRef("");

  // Sketch (line / curve) state
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [draft, setDraft] = useState<Sketch | null>(null);
  const [sketchSnap, setSketchSnap] = useState<SketchSnapPrefs>(DEFAULT_SKETCH_SNAP);
  const [sketchSel, setSketchSel] = useState<string | null>(null);
  const [sketchSeg, setSketchSeg] = useState<number | null>(null);
  const [closeAsk, setCloseAsk] = useState<string | null>(null);
  const snapLabel = useSyncExternalStore(
    subscribeSketchLabel,
    getSketchLabel,
    () => null,
  );

  const grid = snap ? Math.max(step, 0.001) : SNAP;


  useEffect(() => {
    const restored = loadAuto();
    if (restored?.length) setObjects(restored);
    const lines = loadAutoSketches();
    if (lines.length)
      setSketches(lines.map((s) => hydrateSketch(s as Partial<Sketch>)));
    setScenes(listScenes());

    setPrefs(loadPrefs());
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Record<string, number>;
        if (typeof p["speed"] === "number") setSpeed(p["speed"]);
        if (typeof p["moveMul"] === "number") setMoveMul(p["moveMul"]);
        if (typeof p["lookMul"] === "number") setLookMul(p["lookMul"]);
        if (typeof p["liftMul"] === "number") setLiftMul(p["liftMul"]);
        if (typeof p["precisionLevel"] === "number")
          setPrecisionLevel(p["precisionLevel"]);
        if (typeof p["dragStep"] === "number") setDragStep(p["dragStep"]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    autoSave(objects);
  }, [objects]);

  useEffect(() => {
    autoSaveSketches(sketches);
  }, [sketches]);

  // --- Sketch actions -------------------------------------------------------

  /** Snap a raw world point the same way the live cursor does. */
  const snapSketchPoint = useCallback(
    (raw: THREE.Vector3) =>
      resolveSketchPoint(raw, {
        sketches,
        draft,
        prefs: sketchSnap,
        grid,
        tol: Math.max(0.15, grid * 1.2),
        objectSnap: (p, t) => nearestSnapPoint(p, t),
      }).point,
    [sketches, draft, sketchSnap, grid],
  );

  const pushSketchPoint = useCallback(
    (world: THREE.Vector3, normal?: THREE.Vector3) => {
      const p = snapSketchPoint(world);
      const at: Vec3 = [p.x, p.y, p.z];
      setDraft((d) => {
        if (!d) {
          const n: Vec3 = normal
            ? [normal.x, normal.y, normal.z]
            : [0, 1, 0];
          return makeSketch(at, n);
        }
        const first = d.points[0];
        // Snapping back onto the first point closes the loop.
        if (first && d.points.length > 2 && vec(first).distanceTo(p) < 1e-4) {
          setCloseAsk(d.id);
          return { ...d, closed: true };
        }
        return {
          ...d,
          points: [...d.points, at],
          segments: [...d.segments, { h1: null, h2: null }],
        };
      });
    },
    [snapSketchPoint],
  );

  /** Add a point where the on-screen cursor currently sits. */
  const addSketchPoint = useCallback(() => {
    pushSketchPoint(sketchCursor.point.clone());
  }, [pushSketchPoint]);

  const undoSketchPoint = () => {
    setDraft((d) => {
      if (!d) return d;
      if (d.closed) return { ...d, closed: false, filled: false, extrude: 0 };
      if (d.points.length <= 1) return null;
      return {
        ...d,
        points: d.points.slice(0, -1),
        segments: d.segments.slice(0, -1),
      };
    });
    setCloseAsk(null);
  };

  const finishSketch = useCallback(
    (mode: "lines" | "fill" | "extrude" = "lines") => {
      setDraft((d) => {
        if (!d || d.points.length < 2) return null;
        const done: Sketch = {
          ...d,
          filled: mode === "fill",
          extrude: mode === "extrude" ? Math.max(step, 0.1) : 0,
        };
        setSketches((list) => [...list, done]);
        setSketchSel(done.id);
        return null;
      });
      setCloseAsk(null);
      setSketchSeg(null);
    },
    [step],
  );

  const selectedSketch = useMemo(
    () => sketches.find((s) => s.id === sketchSel) ?? null,
    [sketches, sketchSel],
  );

  const patchSketch = useCallback((id: string, patch: Partial<Sketch>) => {
    setSketches((list) =>
      list.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }, []);

  const onSketchTap = useCallback(
    (p: THREE.Vector3, n: THREE.Vector3) => {
      pushSketchPoint(p, n);
    },
    [pushSketchPoint],
  );

  const onSketchPickSegment = useCallback((id: string, seg: number) => {
    setSketchSel(id);
    setSketchSeg(seg);
  }, []);

  const onSketchMovePoint = useCallback((id: string, index: number, p: Vec3) => {
    setSketches((list) =>
      list.map((s) => (s.id === id ? movePoint(s, index, p) : s)),
    );
    setDraft((d) => (d && d.id === id ? movePoint(d, index, p) : d));
  }, []);

  const onSketchMoveHandle = useCallback(
    (id: string, seg: number, which: "h1" | "h2", p: Vec3) => {
      setSketches((list) =>
        list.map((s) => {
          if (s.id !== id) return s;
          const segments = s.segments.map((x, i) =>
            i === seg ? { ...x, [which]: p } : x,
          );
          // Keep the neighbouring handle opposite so curves stay smooth.
          return mirrorHandle({ ...s, segments }, seg, which);
        }),
      );
    },
    [],
  );


  /** Turn the selected straight segment into a bezier (or back). */
  const toggleSegmentCurve = () => {
    const s = selectedSketch;
    if (!s || sketchSeg === null) return;
    const a = s.points[sketchSeg];
    const b = s.points[(sketchSeg + 1) % s.points.length];
    if (!a || !b) return;
    const seg = s.segments[sketchSeg];
    const next = [...s.segments];
    if (seg?.h1) next[sketchSeg] = { h1: null, h2: null };
    else {
      const [h1, h2] = defaultHandles(vec(a), vec(b));
      next[sketchSeg] = { h1, h2 };
    }
    patchSketch(s.id, { segments: next });
  };


  useEffect(() => {
    controls.speed = speed;
    controls.moveMul = moveMul;
    controls.lookMul = lookMul;
    controls.liftMul = liftMul;
    controls.precision = precision;
    controls.precisionLevel = precisionLevel;
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ speed, moveMul, lookMul, liftMul, precisionLevel, dragStep }),
      );
    } catch {
      /* ignore */
    }
  }, [speed, moveMul, lookMul, liftMul, precision, precisionLevel, dragStep]);

  // Keep uniform stretch in sync with the size stepper.
  useEffect(() => {
    if (lockStretch) setStretch([size, size, size]);
  }, [size, lockStretch]);

  const ghostSpec = useMemo<GeometrySpec>(
    () => ({ kind, sides, extrude, edges: edgeMods, profile: null }),
    [kind, sides, extrude, edgeMods],
  );

  const ghostEdges = useMemo(() => edgesOf(ghostSpec), [ghostSpec]);

  // Edge picks belong to a shape; drop them when the shape changes.
  useEffect(() => {
    setSelEdges([]);
    setEdgeMods([]);
  }, [kind, sides, extrude]);

  const selectedObjects = useMemo(
    () => objects.filter((o) => selectedIds.includes(o.id)),
    [objects, selectedIds],
  );

  const selectedOne = selectedObjects[0] ?? null;

  const updateSelected = useCallback(
    (fn: (o: PlacedObject) => PlacedObject) => {
      setObjects((prev) =>
        prev.map((o) => (selectedIds.includes(o.id) ? fn(o) : o)),
      );
    },
    [selectedIds],
  );

  const clearTap = () => {
    tapTarget.point = null;
    tapTarget.normal = null;
    tapTarget.objectId = null;
    setTapPoint(null);
  };

  const wouldCollide = useCallback(
    (candidate: PlacedObject, ignoreIds: string[]) => {
      if (!blockOverlap) return false;
      const box = worldBoxOf(candidate);
      return objects.some(
        (o) => !ignoreIds.includes(o.id) && boxesOverlap(box, worldBoxOf(o)),
      );
    },
    [blockOverlap, objects],
  );

  const place = () => {
    // Confirm mode: the first tap arms, the second commits.
    if (confirmPlace && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    const p = placePoint;
    // Placing on a tapped face copies that object's rotation so faces stay
    // parallel and the stack reads square.
    const faceHost = tapTarget.objectId
      ? objects.find((o) => o.id === tapTarget.objectId)
      : null;
    const next = makeObject(kind, [p.x, p.y, p.z], size, material, {
      scale: [...stretch] as [number, number, number],
      sides,
      extrude,
      edges: edgeMods,
      rotation: faceHost
        ? ([...faceHost.rotation] as [number, number, number])
        : ([0, ghostYaw.value, 0] as [number, number, number]),
    });
    // Face-snapped placements rest on the tapped face and are allowed to pass
    // through other objects in the way; blocking resumes once placed.
    if (!faceHost && wouldCollide(next, [])) {
      toast.error("Blocked — that spot overlaps another object");
      return;
    }
    setObjects((prev) => [...prev, next]);
    setLastPlacedId(next.id);
    const spec: RecentSpec = {
      kind,
      size,
      stretch: [...stretch] as [number, number, number],
      sides,
      extrude,
      edges: edgeMods,
    };
    setRecent((prev) => {
      const key = JSON.stringify(spec);
      return [spec, ...prev.filter((r) => JSON.stringify(r) !== key)].slice(0, 4);
    });
    // Advance the tap target to the new object's outer face so repeated Add
    // keeps building the same aligned stack.
    if (tapTarget.point && tapTarget.normal) {
      const n = tapTarget.normal.clone();
      tapTarget.point = new THREE.Vector3(p.x, p.y, p.z);
      tapTarget.normal = n;
      tapTarget.objectId = next.id;
      setTapPoint([p.x, p.y, p.z]);
    } else {
      clearTap();
    }
  };

  const applyRecent = (r: RecentSpec) => {
    setKind(r.kind);
    setSize(r.size);
    setStretch([...r.stretch] as [number, number, number]);
    setLockStretch(false);
    setSides(r.sides);
    setExtrude(r.extrude);
    setEdgeMods(r.edges ?? []);
  };

  /** Place another copy of the last object, offset beside it like a brick. */
  const repeat = () => {
    const last =
      objects.find((o) => o.id === lastPlacedId) ?? objects[objects.length - 1];
    if (!last) return;
    const s = worldBoxOf(last).getSize(new THREE.Vector3());
    const copy: PlacedObject = {
      ...cloneObject(last, 0),
      position: [last.position[0] + s.x, last.position[1], last.position[2]],
    };
    if (wouldCollide(copy, [])) {
      toast.error("Blocked — that spot overlaps another object");
      return;
    }
    setObjects((prev) => [...prev, copy]);
    setLastPlacedId(copy.id);
  };

  const undo = () => setObjects((prev) => prev.slice(0, -1));

  const handleSelect = useCallback(
    (id: string, additive: boolean) => {
      setSelectedIds((prev) => {
        if (multi || additive) {
          return prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
        }
        return [id];
      });
    },
    [multi],
  );

  const handleMove = useCallback(
    (id: string, pos: [number, number, number]) => {
      setObjects((prev) => {
        const target = prev.find((o) => o.id === id);
        if (!target) return prev;
        let dx = pos[0] - target.position[0];
        let dy = pos[1] - target.position[1];
        let dz = pos[2] - target.position[2];
        if (!dx && !dy && !dz) return prev;
        const ids =
          selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];

        // Solid mode: objects cannot pass through each other. The move is
        // resolved axis by axis so a blocked object slides along the surface.
        if (blockOverlap) {
          const movingBox = new THREE.Box3();
          for (const o of prev) {
            if (ids.includes(o.id)) movingBox.union(worldBoxOf(o));
          }
          const blockers = prev
            .filter((o) => !ids.includes(o.id))
            .map((o) => worldBoxOf(o));
          const ok = resolveMoveSwept(
            movingBox,
            new THREE.Vector3(dx, dy, dz),
            blockers,
          );
          dx = ok.x;
          dy = ok.y;
          dz = ok.z;
          if (!dx && !dy && !dz) return prev;
        }

        let moved = prev.map((o) =>
          ids.includes(o.id)
            ? {
                ...o,
                position: [
                  o.position[0] + dx,
                  o.position[1] + dy,
                  o.position[2] + dz,
                ] as [number, number, number],
              }
            : o,
        );
        // Magnetic alignment: a single dragged object softly snaps into
        // perfect line-up with neighbours.
        if (magnet && ids.length === 1) {
          const target = moved.find((o) => o.id === ids[0]);
          if (target) {
            const box = worldBoxOf(target);
            const others = moved
              .filter((o) => o.id !== target.id)
              .map((o) => ({ id: o.id, box: worldBoxOf(o) }));
            const fix = magneticAlign(box, others, Math.max(0.04, grid * 0.12));
            const c = box.getCenter(new THREE.Vector3());
            const mdx = (fix.x ?? c.x) - c.x;
            const mdy = (fix.y ?? c.y) - c.y;
            const mdz = (fix.z ?? c.z) - c.z;
            let allow = true;
            if (blockOverlap && (mdx || mdy || mdz)) {
              const test = box.clone().translate(new THREE.Vector3(mdx, mdy, mdz));
              allow = !others.some((o) => boxesOverlap(test, o.box));
            }
            if (allow && (mdx || mdy || mdz)) {
              moved = moved.map((o) =>
                o.id === target.id
                  ? {
                      ...o,
                      position: [
                        +(o.position[0] + mdx).toFixed(6),
                        +(o.position[1] + mdy).toFixed(6),
                        +(o.position[2] + mdz).toFixed(6),
                      ] as [number, number, number],
                    }
                  : o,
              );
            }
          }
        }
        return moved;
      });
    },
    [selectedIds, blockOverlap, magnet, grid],
  );


  const onTapTarget = useCallback(
    (p: THREE.Vector3, n: THREE.Vector3, id: string | null) => {
      // Tapping empty ground, or re-tapping the active target, releases the
      // ghost back to the screen-center lattice.
      if (
        id === null ||
        (tapTarget.point && tapTarget.point.distanceTo(p) < 0.001)
      ) {
        tapTarget.point = null;
        tapTarget.normal = null;
        tapTarget.objectId = null;
        setTapPoint(null);
        return;
      }
      const point = p.clone();
      tapTarget.point = point;
      tapTarget.normal = n.clone();
      tapTarget.objectId = id;
      setTapPoint([point.x, point.y, point.z]);
    },
    [],
  );

  // --- cut ------------------------------------------------------------------

  const onCutPick = useCallback(
    (id: string, p: THREE.Vector3, n: THREE.Vector3) => {
      setCutPick({
        objectId: id,
        point: [p.x, p.y, p.z],
        normal: [n.x, n.y, n.z],
      });
      setCat("cut");
    },
    [],
  );

  /** Cutter transform: sunk into the tapped face by the chosen depth. */
  const cutTransform = useMemo(() => {
    if (!cutPick) return null;
    const n = new THREE.Vector3(...cutPick.normal).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      n,
    );
    const e = new THREE.Euler().setFromQuaternion(q);
    const d = Math.max(0.001, cutDepth);
    const center = new THREE.Vector3(...cutPick.point).addScaledVector(
      n,
      -(d / 2) + 0.002,
    );
    return {
      position: [center.x, center.y, center.z] as [number, number, number],
      rotation: [e.x, e.y, e.z] as [number, number, number],
      scale: [Math.max(0.001, cutW), d, Math.max(0.001, cutH)] as [
        number,
        number,
        number,
      ],
    };
  }, [cutPick, cutW, cutH, cutDepth]);

  const cutPreview: CutPreview | null = useMemo(() => {
    if (!cutPick || !cutTransform) return null;
    return {
      objectId: cutPick.objectId,
      spec: {
        kind,
        sides,
        extrude: is2D(kind) ? 1 : 0,
        edges: [],
        profile: null,
      },
      ...cutTransform,
    };
  }, [cutPick, cutTransform, kind, sides]);

  const applyCut = () => {
    if (!cutPick || !cutTransform) return;
    const op: CutOp = {
      id: crypto.randomUUID(),
      op: "subtract",
      kind,
      sides,
      extrude: is2D(kind) ? 1 : 0,
      position: cutTransform.position,
      rotation: cutTransform.rotation,
      scale: cutTransform.scale,
    };
    const target = objects.find((o) => o.id === cutPick.objectId);
    if (!target) return;
    const trial: PlacedObject = { ...target, ops: [...(target.ops ?? []), op] };
    // Verify the cut leaves something behind before committing it.
    const geoAfter = (() => {
      try {
        return geometryOf(trial).getAttribute("position")?.count ?? 0;
      } catch {
        return 0;
      }
    })();
    if (geoAfter === 0) {
      toast.error("That cut would remove the whole object — shrink it");
      return;
    }
    setObjects((prev) => prev.map((o) => (o.id === trial.id ? trial : o)));
    setCutPick(null);
    toast.success(`Cut ${cutW.toFixed(2)}×${cutH.toFixed(2)} × ${cutDepth.toFixed(2)}m deep`);
  };

  const undoLastCut = () => {
    if (selectedIds.length) {
      updateSelected((o) => ({ ...o, ops: (o.ops ?? []).slice(0, -1) }));
      return;
    }
    setObjects((prev) => {
      const last = [...prev].reverse().find((o) => (o.ops ?? []).length);
      if (!last) return prev;
      return prev.map((o) =>
        o.id === last.id ? { ...o, ops: o.ops.slice(0, -1) } : o,
      );
    });
  };

  const booleanSelected = (op: "union" | "intersect" | "subtract") => {
    if (selectedObjects.length < 2) return;
    const [base, ...tools] = selectedObjects;
    if (!base) return;
    const ops: CutOp[] = tools.map((t) => ({
      id: crypto.randomUUID(),
      op,
      kind: t.kind,
      sides: t.sides ?? 6,
      extrude: t.extrude ?? 0,
      position: t.position,
      rotation: t.rotation,
      scale: t.scale ?? [t.size, t.size, t.size],
    }));
    const toolIds = tools.map((t) => t.id);
    setObjects((prev) =>
      prev
        .filter((o) => !toolIds.includes(o.id))
        .map((o) => (o.id === base.id ? { ...o, ops: [...(o.ops ?? []), ...ops] } : o)),
    );
    setSelectedIds([base.id]);
  };

  const applyProfileToSelected = (p: Shape2D) =>
    updateSelected((o) => ({ ...o, profile: p }));

  const setSelectedPos = (axis: 0 | 1 | 2, v: number) => {
    const id = selectedIds[0];
    const first = objects.find((o) => o.id === id);
    if (id && first && selectedIds.length === 1) {
      const target = [...first.position] as [number, number, number];
      target[axis] = +v.toFixed(6);
      handleMove(id, target);
      return;
    }
    updateSelected((o) => {
      const position = [...o.position] as [number, number, number];
      position[axis] = +v.toFixed(6);
      return { ...o, position };
    });
  };

  const onLongPress = useCallback((id: string, x: number, y: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [id]));
    setQuickMenu({ id, x, y });
  }, []);

  const nudge = (axis: 0 | 1 | 2, dir: 1 | -1) => {
    const amount = (dragStep > 0 ? dragStep : step) * dir;
    const id = selectedIds[0];
    if (!id) return;
    const delta: [number, number, number] = [0, 0, 0];
    delta[axis] = amount;
    const first = objects.find((o) => o.id === id);
    if (!first) return;
    handleMove(id, [
      first.position[0] + delta[0],
      first.position[1] + delta[1],
      first.position[2] + delta[2],
    ]);
  };


  const stretchSelected = (axis: 0 | 1 | 2, dir: 1 | -1) => {
    updateSelected((o) => {
      const scale = [...(o.scale ?? [o.size, o.size, o.size])] as [
        number,
        number,
        number,
      ];
      scale[axis] = Math.max(0.001, +((scale[axis] ?? 1) + dir * step).toFixed(6));
      return { ...o, scale };
    });
  };

  const setSelectedScale = (axis: 0 | 1 | 2, v: number) => {
    updateSelected((o) => {
      const scale = [...(o.scale ?? [o.size, o.size, o.size])] as [
        number,
        number,
        number,
      ];
      scale[axis] = Math.max(0.001, +v.toFixed(6));
      return { ...o, scale };
    });
  };

  const rotate = (axis: 0 | 1 | 2, dir: 1 | -1) => {
    const rad = (rotStep * Math.PI) / 180;
    updateSelected((o) => {
      const rotation = [...o.rotation] as [number, number, number];
      rotation[axis] = +((rotation[axis] ?? 0) + dir * rad).toFixed(6);
      return { ...o, rotation };
    });
  };

  const resizeSelected = (dir: 1 | -1) => {
    updateSelected((o) => {
      const s = o.scale ?? [o.size, o.size, o.size];
      return {
        ...o,
        scale: s.map((v) => Math.max(0.001, +(v + dir * step).toFixed(6))) as [
          number,
          number,
          number,
        ],
      };
    });
  };

  const setMotion = (patch: Partial<MotionSpec>) => {
    updateSelected((o) => ({
      ...o,
      motion: { ...(o.motion ?? DEFAULT_MOTION), ...patch },
    }));
  };

  const duplicateObjects = (list: PlacedObject[]) => {
    if (!list.length) return;
    let copies = list.map((o) => cloneObject(o, snap ? grid : 0.25));
    // Solid mode: slide each copy clear of whatever it lands inside.
    if (blockOverlap) {
      const blockers = objects.map((o) => worldBoxOf(o));
      copies = copies.map((c) => {
        let out = c;
        for (let i = 0; i < 24; i++) {
          const box = worldBoxOf(out);
          if (!blockers.some((b) => boxesOverlap(box, b))) break;
          const w = box.getSize(new THREE.Vector3()).x || 1;
          out = {
            ...out,
            position: [out.position[0] + w, out.position[1], out.position[2]] as [
              number,
              number,
              number,
            ],
          };
        }
        blockers.push(worldBoxOf(out));
        return out;
      });
    }
    setObjects((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  };

  const duplicate = () => duplicateObjects(selectedObjects);

  const removeSelected = () => {
    setObjects((prev) => prev.filter((o) => !selectedIds.includes(o.id)));
    setSelectedIds([]);
  };

  const groupSelected = () => {
    if (selectedIds.length < 2) return;
    const gid = crypto.randomUUID();
    setObjects((prev) =>
      prev.map((o) => (selectedIds.includes(o.id) ? { ...o, groupId: gid } : o)),
    );
  };

  const ungroupSelected = () => updateSelected((o) => ({ ...o, groupId: null }));

  const applyMaterialToSelected = (m: Material) =>
    updateSelected((o) => ({ ...o, ...m }));

  const onMeasurePick = useCallback((p: THREE.Vector3) => {
    const t: [number, number, number] = [p.x, p.y, p.z];
    measureRef.current = measureRef.current.b
      ? { a: t, b: null }
      : measureRef.current.a
        ? { a: measureRef.current.a, b: t }
        : { a: t, b: null };
    setMeasureA(measureRef.current.a);
    setMeasureB(measureRef.current.b);
  }, []);

  const resetMeasure = () => {
    measureRef.current = { a: null, b: null };
    setMeasureA(null);
    setMeasureB(null);
  };

  /** Live "lines up on X/Y/Z" readout for the selection. */
  const alignedAxes = useMemo(() => {
    if (!selectedOne) return [] as string[];
    const box = worldBoxOf(selectedOne);
    const others = objects
      .filter((o) => o.id !== selectedOne.id)
      .map((o) => ({ id: o.id, box: worldBoxOf(o) }));
    const hits = alignmentsFor(box, others, Math.max(0.005, grid * 0.25));
    return Array.from(new Set(hits.map((h) => ["X", "Y", "Z"][h.axis] as string)));
  }, [selectedOne, objects, grid]);

  // --- box select -----------------------------------------------------------
  const projectToScreen = (o: PlacedObject) => {
    const cam = sceneRefs.camera;
    if (!cam) return null;
    const v = new THREE.Vector3(...o.position).project(cam);
    return {
      x: ((v.x + 1) / 2) * sceneRefs.width,
      y: ((1 - v.y) / 2) * sceneRefs.height,
      z: v.z,
    };
  };

  const finishRect = () => {
    if (rect) {
      const minX = Math.min(rect.x0, rect.x1);
      const maxX = Math.max(rect.x0, rect.x1);
      const minY = Math.min(rect.y0, rect.y1);
      const maxY = Math.max(rect.y0, rect.y1);
      const hits = objects.filter((o) => {
        const p = projectToScreen(o);
        return p && p.z < 1 && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      });
      setSelectedIds(hits.map((h) => h.id));
    }
    setRect(null);
    rectActive.current = false;
  };

  const selectionCenter = useMemo(() => centroid(selectedObjects), [selectedObjects]);

  // Publish the selection centroid so the fly rig can glide to it
  // (double-tap on the canvas or the Focus button).
  useEffect(() => {
    if (selectedObjects.length) {
      selectionFocusState.point.copy(selectionCenter);
      selectionFocusState.valid = true;
    } else {
      selectionFocusState.valid = false;
    }
  }, [selectionCenter, selectedObjects.length]);

  const doSave = () => {
    const name = sceneName.trim() || `scene-${scenes.length + 1}`;
    saveScene(name, objects);
    saveSketches(name, sketches);

    setScenes(listScenes());
    setSceneName("");
    toast.success(`Saved “${name}”`);
  };

  // --- AI -------------------------------------------------------------------

  const sceneSummary = () =>
    objects
      .slice(-30)
      .map(
        (o) =>
          `${o.kind} at ${o.position.map((v) => v.toFixed(2)).join(",")} size ${(
            o.scale ?? [o.size, o.size, o.size]
          )
            .map((v) => v.toFixed(2))
            .join("×")}`,
      )
      .join("\n");

  const applySteps = (steps: BuildStep[]) => {
    const created: PlacedObject[] = [];
    let next = [...objects];
    for (const s of steps) {
      const kindOk = ([...SHAPES_3D, ...SHAPES_2D] as string[]).includes(s.kind)
        ? (s.kind as ShapeKind)
        : "box";
      if (s.op === "place") {
        const o = makeObject(
          kindOk,
          [s.x, s.y, s.z],
          Math.max(0.001, s.sx),
          { ...material, color: s.color || material.color },
          {
            scale: [
              Math.max(0.001, s.sx),
              Math.max(0.001, s.sy),
              Math.max(0.001, s.sz),
            ] as [number, number, number],
            rotation: [s.rx, s.ry, s.rz] as [number, number, number],
            sides: Math.max(3, Math.round(s.sides || 6)),
            extrude: Math.max(0, s.extrude),
          },
        );
        created.push(o);
        next = [...next, o];
      } else {
        const tool: CutOp = {
          id: crypto.randomUUID(),
          op: "subtract",
          kind: kindOk,
          sides: Math.max(3, Math.round(s.sides || 6)),
          extrude: is2D(kindOk) ? Math.max(0.01, s.extrude || 1) : 0,
          position: [s.x, s.y, s.z],
          rotation: [s.rx, s.ry, s.rz],
          scale: [
            Math.max(0.001, s.sx),
            Math.max(0.001, s.sy),
            Math.max(0.001, s.sz),
          ],
        };
        const center = new THREE.Vector3(s.x, s.y, s.z);
        const reach = Math.max(s.sx, s.sy, s.sz);
        next = next.map((o) => {
          const os = o.scale ?? [o.size, o.size, o.size];
          const d = new THREE.Vector3(...o.position).distanceTo(center);
          const overlaps = d < reach / 2 + Math.max(...os);
          return overlaps ? { ...o, ops: [...(o.ops ?? []), tool] } : o;
        });
      }
    }
    setObjects(next);
    setAiIds(created.map((c) => c.id));
  };

  const runAi = async () => {
    const text = prompt.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    beforeAi.current = objects;
    lastPrompt.current = text;
    try {
      const result = await aiBuild({
        data: {
          prompt: text,
          preferences: prefsPrompt(prefs),
          examples: examplesPrompt(text),
          scene: sceneSummary(),
        },
      });
      setAiSummary(result.summary);
      setAiSteps(result.steps);
      applySteps(result.steps);
      toast.success(`Built ${result.steps.length} steps`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI build failed");
    } finally {
      setAiBusy(false);
    }
  };

  const acceptAi = () => {
    recordExample({
      prompt: lastPrompt.current,
      summary: aiSummary ?? "",
      accepted: true,
      at: Date.now(),
      stepCount: aiSteps.length,
    });
    setAiSummary(null);
    setAiSteps([]);
    setAiIds([]);
    beforeAi.current = null;
    toast.success("Saved — the builder learns from this");
  };

  const rejectAi = (correction: string) => {
    recordExample({
      prompt: lastPrompt.current,
      summary: aiSummary ?? "",
      accepted: false,
      correction,
      at: Date.now(),
      stepCount: aiSteps.length,
    });
    if (beforeAi.current) setObjects(beforeAi.current);
    setAiSummary(null);
    setAiSteps([]);
    setAiIds([]);
    beforeAi.current = null;
  };

  const shapeList = (list: readonly string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((k) => (
        <Chip
          key={k}
          active={kind === k}
          onClick={() => setKind(k as ShapeKind)}
        >
          {k}
        </Chip>
      ))}
    </div>
  );

  const openCat = (c: Cat) => {
    if (cat === c) {
      setCat(null);
      return;
    }
    setCat(c);
    setCollapsed(false);
    const def = CATS.find((x) => x.id === c);
    if (def?.tool) {
      setTool(def.tool);
      if (def.tool !== "measure") resetMeasure();
      if (def.tool !== "place") clearTap();
      if (def.tool !== "cut") setCutPick(null);
    }
  };

  const stepRow = (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        step
      </span>
      {STEPS.map((s) => (
        <Chip key={s} active={step === s} onClick={() => setStep(s)}>
          {s}
        </Chip>
      ))}
    </div>
  );

  const noSelection = (
    <p className="font-mono text-[10px] text-muted-foreground">
      Tap an object first.
    </p>
  );

  /** Shared derivations for the Shapes strips. */
  const shapesCtl = () => {
    const inc = +(digit * Math.pow(10, -places)).toFixed(6);
    const dec = (n: number) => n.toFixed(Math.min(3, places + 1));
    const edges = ghostEdges;
    const modOf = (i: number) =>
      edgeMods.find((m) => m.i === i) ?? { i, curve: 0, angle: 0 };
    const bumpEdge = (field: "curve" | "angle", delta: number) => {
      if (!selEdges.length) return;
      setEdgeMods((prev) => {
        const next = [...prev];
        const targets = new Set(selEdges);
        if (mirrorEdges) {
          // Mirror onto the opposite parallel edge so boxes stay square.
          for (const i of selEdges) {
            const e = edges[i];
            if (!e) continue;
            edges.forEach((o: (typeof edges)[number], j: number) => {
              if (j === i) return;
              if (Math.abs(o.dir.dot(e.dir)) > 0.99 && o.mid.distanceTo(e.mid) > 0.2)
                targets.add(j);
            });
          }
        }
        for (const i of targets) {
          const at = next.findIndex((m) => m.i === i);
          const base = at >= 0 ? next[at]! : { i, curve: 0, angle: 0 };
          const upd = { ...base, [field]: +(base[field] + delta).toFixed(4) };
          if (at >= 0) next[at] = upd;
          else next.push(upd);
        }
        return next;
      });
    return { inc, dec, edges, modOf, bumpEdge };
  };

  /** Shapes controls docked to the top edge: step size + dimensions. */
  const shapesTopStrip = () => {
    const { inc, dec } = shapesCtl();
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            step
          </span>
          {[1, 2, 5].map((d) => (
            <Chip key={d} active={digit === d} onClick={() => setDigit(d)}>
              {d}
            </Chip>
          ))}
          {[0, 1, 2, 3].map((pl) => (
            <Chip key={pl} active={places === pl} onClick={() => setPlaces(pl)}>
              {pl === 0 ? "×1" : `×.${"0".repeat(pl - 1)}1`}
            </Chip>
          ))}
          <span className="font-mono text-[10px] text-accent">±{inc}</span>
        </div>
        {/* Size: big steppers, tap the number to type an exact value. */}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            (lockStretch
              ? [["size", size, (v: number) => setSize(v)]]
              : [
                  [
                    "x",
                    stretch[0] ?? 1,
                    (v: number) =>
                      setStretch((s) => [v, s[1], s[2]] as [number, number, number]),
                  ],
                  [
                    "y",
                    stretch[1] ?? 1,
                    (v: number) =>
                      setStretch((s) => [s[0], v, s[2]] as [number, number, number]),
                  ],
                  [
                    "z",
                    stretch[2] ?? 1,
                    (v: number) =>
                      setStretch((s) => [s[0], s[1], v] as [number, number, number]),
                  ],
                ]) as [string, number, (v: number) => void][]
          ).map(([label, value, set]) => (
            <div
              key={label}
              className="flex items-center gap-1 rounded-md border border-grid-line bg-panel/70 p-1"
            >
              <span className="w-7 font-mono text-[10px] uppercase text-muted-foreground">
                {label}
              </span>
              <Btn onClick={() => set(Math.max(0.001, +(value - inc).toFixed(4)))}>
                −
              </Btn>
              <button
                type="button"
                className="min-w-14 rounded bg-panel px-1.5 py-1 font-mono text-xs text-foreground"
                onClick={() => {
                  const v = window.prompt(`${label} (m)`, String(value));
                  const n = Number(v);
                  if (v !== null && Number.isFinite(n) && n > 0) set(n);
                }}
              >
                {dec(value)}
              </button>
              <Btn onClick={() => set(+(value + inc).toFixed(4))}>+</Btn>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** Shapes controls docked to the bottom edge: edges, curves, advanced. */
  const shapesBottomStrip = () => {
    const { inc, dec, edges, modOf, bumpEdge } = shapesCtl();
    void edges;
    return (
      <div className="flex flex-col gap-1">
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Chip active={lockStretch} onClick={() => setLockStretch((l) => !l)}>
            {lockStretch ? "uniform" : "per-edge"}
          </Chip>
          <Chip active={advanced} onClick={() => setAdvanced((a) => !a)}>
            Advanced
          </Chip>
          <Chip
            active={confirmPlace}
            onClick={() => {
              setConfirmPlace((c) => !c);
              setArmed(false);
            }}
          >
            Confirm {confirmPlace ? "on" : "off"}
          </Chip>
        </div>
        {/* Edge picker — swipe the strip, tap to select one or more edges. */}
        <div className="mt-1.5">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">
              edges
            </span>
            <Chip active={mirrorEdges} onClick={() => setMirrorEdges((m) => !m)}>
              Mirror
            </Chip>
            <Chip
              active={false}
              onClick={() => {
                setSelEdges([]);
                setEdgeMods([]);
              }}
            >
              Reset
            </Chip>
            <span className="font-mono text-[10px] text-muted-foreground">
              {selEdges.length ? `${selEdges.length} picked` : "tap an edge"}
            </span>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {edges.map((_e: (typeof edges)[number], i: number) => {
              const m = modOf(i);
              const on = selEdges.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setSelEdges((prev) =>
                      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                    )
                  }
                  className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] ${
                    on
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-grid-line bg-panel/70 text-muted-foreground"
                  }`}
                >
                  e{i + 1}
                  {m.curve || m.angle ? "•" : ""}
                </button>
              );
            })}
            {!edges.length && (
              <span className="font-mono text-[10px] text-muted-foreground">
                no editable edges on this shape
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <div className="flex items-center gap-1 rounded-md border border-grid-line bg-panel/70 p-1">
              <span className="w-9 font-mono text-[10px] uppercase text-muted-foreground">
                curve
              </span>
              <Btn onClick={() => bumpEdge("curve", -inc)}>−</Btn>
              <span className="min-w-12 text-center font-mono text-xs">
                {dec(selEdges.length ? modOf(selEdges[0]!).curve : 0)}
              </span>
              <Btn onClick={() => bumpEdge("curve", inc)}>+</Btn>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-grid-line bg-panel/70 p-1">
              <span className="w-9 font-mono text-[10px] uppercase text-muted-foreground">
                angle
              </span>
              <Btn onClick={() => bumpEdge("angle", -1)}>−</Btn>
              <span className="min-w-12 text-center font-mono text-xs">
                {(selEdges.length ? modOf(selEdges[0]!).angle : 0).toFixed(1)}°
              </span>
              <Btn onClick={() => bumpEdge("angle", 1)}>+</Btn>
            </div>
            {[15, 30, 45, 90].map((a) => (
              <Chip
                key={a}
                active={false}
                onClick={() => {
                  if (!selEdges.length) return;
                  bumpEdge("angle", a - modOf(selEdges[0]!).angle);
                }}
              >
                {a}°
              </Chip>
            ))}
          </div>
        </div>
        {advanced && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-grid-line pt-1.5">
            <Chip
              active={is2D(kind)}
              onClick={() => setKind(is2D(kind) ? "box" : "rect")}
            >
              {is2D(kind) ? "2D" : "3D"}
            </Chip>
            {is2D(kind) && (
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  extrude
                </span>
                <Btn onClick={() => setExtrude((v) => Math.max(0, +(v - inc).toFixed(4)))}>
                  −
                </Btn>
                <span className="min-w-12 text-center font-mono text-xs">
                  {dec(extrude)}
                </span>
                <Btn onClick={() => setExtrude((v) => +(v + inc).toFixed(4))}>+</Btn>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                sides
              </span>
              <Btn onClick={() => setSides((v) => Math.max(3, v - 1))}>−</Btn>
              <span className="min-w-8 text-center font-mono text-xs">{sides}</span>
              <Btn onClick={() => setSides((v) => Math.min(64, v + 1))}>+</Btn>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                turn
              </span>
              {(["X", "Y", "Z"] as const).map((ax, i) => (
                <Btn
                  key={ax}
                  onClick={() =>
                    updateSelected((o) => {
                      const r = [...o.rotation] as [number, number, number];
                      r[i] = r[i]! + THREE.MathUtils.degToRad(rotStep);
                      return { ...o, rotation: r };
                    })
                  }
                >
                  {ax}
                </Btn>
              ))}
              <span className="font-mono text-[10px] text-muted-foreground">
                {rotStep}°
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const stripBody = () => {
    switch (cat) {
      case "line": {
        const s = selectedSketch;
        const curved = s && sketchSeg !== null && !!s.segments[sketchSeg]?.h1;
        return (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Btn onClick={addSketchPoint} hint="linePoint">
                + Point
              </Btn>
              <Btn onClick={undoSketchPoint} hint="lineUndo">
                Undo pt
              </Btn>
              <Btn onClick={() => finishSketch("lines")} hint="lineFinish">
                Finish
              </Btn>
              <span className="font-mono text-[10px] text-muted-foreground">
                {draft
                  ? `${draft.points.length} pts · ${sketchLength(draft).toFixed(3)}m`
                  : "tap or + Point to start"}
                {snapLabel ? ` · ${snapLabel}` : ""}
              </span>
            </div>

            {closeAsk && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  loop closed
                </span>
                <Btn onClick={() => finishSketch("lines")}>Keep lines</Btn>
                <Btn onClick={() => finishSketch("fill")}>Fill face</Btn>
                <Btn onClick={() => finishSketch("extrude")}>Extrude</Btn>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                snap
              </span>
              {(
                [
                  ["endpoints", "ends"],
                  ["midpoints", "mids"],
                  ["objects", "objects"],
                  ["gridAngle", "grid 15°"],
                ] as const
              ).map(([k, label]) => (
                <Chip
                  key={k}
                  active={sketchSnap[k]}
                  hint="lineSnap"
                  onClick={() => setSketchSnap((p) => ({ ...p, [k]: !p[k] }))}
                >
                  {label}
                </Chip>
              ))}
            </div>

            {s ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {sketchSeg === null ? "sketch" : `seg ${sketchSeg + 1}`}
                </span>
                <Btn onClick={toggleSegmentCurve} hint="lineCurve">
                  {curved ? "Straighten" : "Curve"}
                </Btn>
                {s.closed && (
                  <>
                    <Chip
                      active={s.filled && !s.extrude}
                      onClick={() =>
                        patchSketch(s.id, { filled: !s.filled, extrude: 0 })
                      }
                    >
                      fill
                    </Chip>
                    <Chip
                      active={s.extrude > 0}
                      onClick={() =>
                        patchSketch(s.id, {
                          extrude: s.extrude > 0 ? 0 : Math.max(step, 0.1),
                        })
                      }
                    >
                      extrude
                    </Chip>
                  </>
                )}
                {s.extrude > 0 && (
                  <>
                    <Btn
                      onClick={() =>
                        patchSketch(s.id, {
                          extrude: Math.max(0.001, s.extrude - step),
                        })
                      }
                    >
                      −
                    </Btn>
                    <span className="font-mono text-[11px]">
                      {s.extrude.toFixed(3)}
                    </span>
                    <Btn
                      onClick={() => patchSketch(s.id, { extrude: s.extrude + step })}
                    >
                      +
                    </Btn>
                  </>
                )}
                <Btn
                  onClick={() =>
                    setSketches((list) => [...list, cloneSketch(s, step || 0.5)])
                  }
                >
                  Dup
                </Btn>
                <Btn
                  onClick={() => {
                    setSketches((list) => list.filter((x) => x.id !== s.id));
                    setSketchSel(null);
                    setSketchSeg(null);
                  }}
                >
                  Delete
                </Btn>
                {(["x", "y", "z"] as const).map((ax, i) => (
                  <Btn
                    key={ax}
                    onClick={() => {
                      const d: Vec3 = [0, 0, 0];
                      d[i] = step;
                      patchSketch(s.id, translateSketch(s, d));
                    }}
                  >
                    {ax}+{step}
                  </Btn>
                ))}
              </div>
            ) : (
              <p className="font-mono text-[10px] text-muted-foreground">
                Tap a line to select it, then curve or edit it.
              </p>
            )}
            {stepRow}
          </>
        );
      }

      case "move":
        return (
          <>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <Chip
                active={nav === "gesture"}
                onClick={() => setNav("gesture")}
                hint="nav"
              >
                Swipe fly
              </Chip>
              <Chip
                active={nav === "swipe-look"}
                onClick={() => setNav("swipe-look")}
                hint="nav"
              >
                Swipe look
              </Chip>
            </div>
            <p className="mb-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {nav === "gesture"
                ? "Swipe any direction to fly that way; hold your finger there to keep going. Pinch moves forward and back. Use the Look stick to pivot in place."
                : "Swipe rotates the view; two fingers pan and pinch."}
            </p>
            <Slider
              label="speed"
              value={speed}
              min={0.05}
              max={3}
              step={0.05}
              onChange={setSpeed}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="stick"
              value={moveMul}
              min={0.1}
              max={2}
              step={0.05}
              onChange={setMoveMul}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="look"
              value={lookMul}
              min={0.1}
              max={2}
              step={0.05}
              onChange={setLookMul}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="lift"
              value={liftMul}
              min={0.1}
              max={2}
              step={0.05}
              onChange={setLiftMul}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="slow at"
              value={precisionLevel}
              min={0.02}
              max={1}
              step={0.02}
              onChange={setPrecisionLevel}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <div className="flex flex-wrap gap-1.5">
              <Chip active={precision} onClick={() => setPrecision((p) => !p)}>
                Slow {precision ? "on" : "off"}
              </Chip>
              <Chip active={sticks} onClick={() => setSticks((s) => !s)}>
                Sticks {sticks ? "on" : "off"}
              </Chip>
              <Btn onClick={() => setDepth((d) => +(d + 1).toFixed(2))}>Depth +</Btn>
              <Btn onClick={() => setDepth((d) => Math.max(1, +(d - 1).toFixed(2)))}>
                Depth −
              </Btn>
              <span className="self-center font-mono text-[10px] text-muted-foreground">
                {depth.toFixed(1)}m
              </span>
            </div>
          </>
        );

      // Shapes lives in its own top + bottom edge strips, never in this panel.
      case "place":
        return null;



      case "edit":
        return (
          <>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <Chip active={multi} onClick={() => setMulti((m) => !m)}>
                Multi
              </Chip>
              <Chip active={boxSelect} onClick={() => setBoxSelect((b) => !b)}>
                Box
              </Chip>
              <Chip
                active={dragPlane === "facing"}
                onClick={() =>
                  setDragPlane((p) => (p === "facing" ? "horizontal" : "facing"))
                }
              >
                {dragPlane === "facing" ? "Face" : "Horz"}
              </Chip>
              <Btn onClick={duplicate} disabled={!selectedIds.length} hint="dup">
                Dup
              </Btn>
              <Btn onClick={groupSelected} disabled={selectedIds.length < 2} hint="group">
                Group
              </Btn>
              <Btn onClick={ungroupSelected} disabled={!selectedIds.length} hint="ungroup">
                Ungrp
              </Btn>
              <Btn onClick={() => booleanSelected("union")} disabled={selectedIds.length < 2}>
                Join
              </Btn>
              <Btn onClick={() => booleanSelected("subtract")} disabled={selectedIds.length < 2}>
                Sub
              </Btn>
              <Btn onClick={undoLastCut} hint="uncut">Uncut</Btn>
              <Btn onClick={removeSelected} disabled={!selectedIds.length} hint="del">
                Del
              </Btn>
              <Btn
                onClick={() => requestFlyFocus(selectionFocusState.point)}
                disabled={!selectedIds.length}
              >
                Focus
              </Btn>
            </div>
            {stepRow}
            <div className="mt-1.5">
              <NumRow
                label="drag by"
                value={dragStep}
                min={0}
                max={5}
                step={step}
                onChange={setDragStep}
              />
              <p className="mb-1 font-mono text-[10px] text-muted-foreground">
                0 = free drag. Otherwise objects hop in {dragStep.toFixed(3)}m steps.
              </p>
            </div>
            {selectedOne ? (
              <>
                {(
                  [
                    [0, "x", "text-axis-x"],
                    [1, "y", "text-axis-y"],
                    [2, "z", "text-axis-z"],
                  ] as const
                ).map(([axis, label]) => (
                  <div key={label} className="mb-1 flex items-center gap-1.5">
                    <span className="w-12 font-mono text-[10px] uppercase text-muted-foreground">
                      {label}
                    </span>
                    <Btn onClick={() => nudge(axis, -1)}>−</Btn>
                    <EditableValue
                      value={selectedOne.position[axis] ?? 0}
                      onCommit={(v) => setSelectedPos(axis, v)}
                      className="min-w-16 text-center"
                    />
                    <Btn onClick={() => nudge(axis, 1)}>+</Btn>
                    <span className="ml-auto flex items-center gap-1">
                      <Btn onClick={() => rotate(axis, -1)}>↺</Btn>
                      <Btn onClick={() => rotate(axis, 1)}>↻</Btn>
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">
                    rot
                  </span>
                  {ROT_STEPS.map((r) => (
                    <Chip key={r} active={rotStep === r} onClick={() => setRotStep(r)}>
                      {r}°
                    </Chip>
                  ))}
                </div>
              </>
            ) : (
              noSelection
            )}
          </>
        );

      case "stretch":
        return selectedOne ? (
          <>
            {stepRow}
            <div className="mt-1.5">
              {(["x", "y", "z"] as const).map((ax, i) => (
                <NumRow
                  key={ax}
                  label={ax}
                  value={(selectedOne.scale ?? [1, 1, 1])[i] ?? 1}
                  min={0.001}
                  max={40}
                  step={step}
                  onChange={(v) => setSelectedScale(i as 0 | 1 | 2, v)}
                />
              ))}
              <div className="flex gap-1.5">
                <Btn onClick={() => resizeSelected(-1)}>All −</Btn>
                <Btn onClick={() => resizeSelected(1)}>All +</Btn>
                {(["x", "y", "z"] as const).map((ax, i) => (
                  <span key={ax} className="flex items-center gap-1">
                    <Btn onClick={() => stretchSelected(i as 0 | 1 | 2, -1)}>−{ax}</Btn>
                    <Btn onClick={() => stretchSelected(i as 0 | 1 | 2, 1)}>+{ax}</Btn>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  profile
                </span>
                {SHAPES_2D.map((p) => (
                  <Chip key={p} onClick={() => applyProfileToSelected(p)}>
                    {p}
                  </Chip>
                ))}
                <Chip onClick={() => updateSelected((o) => ({ ...o, profile: null }))}>
                  none
                </Chip>
              </div>
            </div>
          </>
        ) : (
          noSelection
        );

      case "cut":
        return (
          <>
            <div className="max-h-16 overflow-y-auto">
              {shapeList([...SHAPES_2D, ...SHAPES_3D])}
            </div>
            <div className="mt-1.5">{stepRow}</div>
            <div className="mt-1.5">
              <NumRow label="width" value={cutW} min={0.001} max={20} step={step} onChange={setCutW} />
              <NumRow label="height" value={cutH} min={0.001} max={20} step={step} onChange={setCutH} />
              <NumRow label="depth" value={cutDepth} min={0.001} max={20} step={step} onChange={setCutDepth} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {cutPick ? (
                <>
                  <Btn onClick={applyCut} hint="cut">Apply cut</Btn>
                  <Btn onClick={() => setCutPick(null)}>Cancel</Btn>
                </>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                  Tap the face you want to cut into.
                </span>
              )}
              <Btn onClick={undoLastCut} hint="uncut">Undo cut</Btn>
            </div>
          </>
        );

      case "snap":
        return (
          <>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <Chip active={snap} onClick={() => setSnap((s) => !s)} hint="gridSnap">
                Grid snap {snap ? "on" : "off"}
              </Chip>
              <Chip
                active={shapeSnap}
                onClick={() => setShapeSnap((s) => !s)}
                hint="shapeSnap"
              >
                Shape snap {shapeSnap ? "on" : "off"}
              </Chip>
              <Chip
                active={blockOverlap}
                onClick={() => setBlockOverlap((b) => !b)}
                hint="solid"
              >
                {blockOverlap ? "Solid" : "Ghost"}
              </Chip>
              <Chip
                active={showGuides}
                onClick={() => setShowGuides((g) => !g)}
                hint="guides"
              >
                Align guides {showGuides ? "on" : "off"}
              </Chip>
              <Chip active={magnet} onClick={() => setMagnet((m) => !m)} hint="magnet">
                Magnet {magnet ? "on" : "off"}
              </Chip>
              {(["center", "min", "max"] as AlignMode[]).map((m) => (
                <Chip
                  key={m}
                  active={alignMode === m}
                  onClick={() => setAlignMode(m)}
                  hint="faceAlign"
                >
                  {m === "center" ? "Center face" : m === "min" ? "Flush min" : "Flush max"}
                </Chip>
              ))}
              <Chip active={!!tapPoint} onClick={clearTap} hint="tapTarget">
                {tapPoint ? "Clear tap target" : "No tap target"}
              </Chip>
            </div>
            {stepRow}
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Grid snap rounds to the active step ({step}m). Shape snap pulls to
              corners, edge midpoints and face centers of nearby objects. Tap a
              face to set a target — the next shape rests on that surface.
              Solid mode stops objects passing through each other. Face
              alignment centers the new shape on the tapped face (or lines it up
              flush with an edge) so stacks sit square on every side.
              {alignedAxes.length
                ? ` Selection lines up on ${alignedAxes.join(", ")}.`
                : ""}
            </p>
          </>
        );

      case "motion": {
        if (!selectedOne) return noSelection;
        const m = selectedOne.motion ?? DEFAULT_MOTION;
        return (
          <>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {(["off", "linear", "oscillate", "orbit"] as MotionMode[]).map((mode) => (
                <Chip
                  key={mode}
                  active={m.mode === mode}
                  onClick={() => setMotion({ mode })}
                >
                  {mode}
                </Chip>
              ))}
              <Chip active={playing} onClick={() => setPlaying((p) => !p)}>
                {playing ? "Playing" : "Paused"}
              </Chip>
            </div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                axis
              </span>
              {(["X", "Y", "Z"] as const).map((l, i) => (
                <Chip
                  key={l}
                  active={m.axis === i}
                  onClick={() => setMotion({ axis: i as 0 | 1 | 2 })}
                >
                  {l}
                </Chip>
              ))}
            </div>
            <NumRow
              label={m.mode === "orbit" ? "radius" : "distance"}
              value={m.distance}
              min={0}
              max={40}
              step={step}
              onChange={(v) => setMotion({ distance: v })}
            />
            <NumRow
              label="speed"
              value={m.speed}
              min={0.01}
              max={10}
              step={0.05}
              onChange={(v) => setMotion({ speed: v })}
              unit={m.mode === "orbit" ? "r/s" : "m/s"}
            />
            <NumRow
              label="accel"
              value={m.accel}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setMotion({ accel: v })}
              unit=""
            />
            <NumRow
              label="pause"
              value={m.pause}
              min={0}
              max={10}
              step={0.1}
              onChange={(v) => setMotion({ pause: v })}
              unit="s"
            />
          </>
        );
      }

      case "style":
        return (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`color ${c}`}
                  onClick={() => {
                    const next = { ...material, color: c };
                    setMaterial(next);
                    if (selectedIds.length) applyMaterialToSelected(next);
                  }}
                  className={`h-7 w-7 rounded-md border ${
                    material.color === c ? "border-accent" : "border-grid-line"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                aria-label="custom color"
                value={material.color}
                onChange={(e) => {
                  const next = { ...material, color: e.target.value };
                  setMaterial(next);
                  if (selectedIds.length) applyMaterialToSelected(next);
                }}
                className="h-7 w-9 rounded-md border border-grid-line bg-transparent"
              />
            </div>
            {(["metalness", "roughness"] as const).map((key) => (
              <Slider
                key={key}
                label={key.slice(0, 5)}
                value={material[key]}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => {
                  const next = { ...material, [key]: v };
                  setMaterial(next);
                  if (selectedIds.length) applyMaterialToSelected(next);
                }}
              />
            ))}
          </>
        );

      case "measure":
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Btn onClick={() => onMeasurePick(centerPoint.clone())}>Mark point</Btn>
            <Btn onClick={resetMeasure}>Clear</Btn>
            <span className="font-mono text-[10px] text-muted-foreground">
              Tap two points, or mark the screen center.
            </span>
          </div>
        );

      case "ai":
        return (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a 4m brick wall with an arched doorway"
              rows={2}
              className="w-full resize-none rounded-md border border-grid-line bg-background/60 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-accent"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Btn onClick={runAi} disabled={aiBusy || !prompt.trim()}>
                {aiBusy ? "Building…" : "Build"}
              </Btn>
              {aiIds.length > 0 && (
                <>
                  <Btn onClick={acceptAi}>Keep</Btn>
                  <Btn onClick={() => rejectAi("undone by user")}>Undo</Btn>
                </>
              )}
            </div>
            {aiSummary && (
              <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                {aiSummary} — {aiSteps.length} steps.
              </p>
            )}
            <input
              value={prefs.notes}
              onChange={(e) => {
                const next = { ...prefs, notes: e.target.value };
                setPrefs(next);
                savePrefs(next);
              }}
              placeholder="style notes it should always follow"
              className="mt-1.5 w-full rounded-md border border-grid-line bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
            />
          </>
        );

      case "files":
        return (
          <>
            <div className="mb-1.5 flex gap-1.5">
              <input
                value={sceneName}
                onChange={(e) => setSceneName(e.target.value)}
                placeholder="scene name"
                className="min-w-0 flex-1 rounded-md border border-grid-line bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
              />
              <Btn onClick={doSave}>Save</Btn>
              <Btn
                onClick={() => {
                  setObjects([]);
                  setSelectedIds([]);
                  setSketches([]);
                  setDraft(null);
                  setSketchSel(null);
                }}

              >
                New
              </Btn>
            </div>
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {scenes.length === 0 && (
                <p className="font-mono text-[10px] text-muted-foreground">
                  No saved scenes yet.
                </p>
              )}
              {scenes.map((n) => (
                <div key={n} className="flex items-center gap-1.5">
                  <span className="flex-1 truncate font-mono text-[11px]">{n}</span>
                  <Btn
                    onClick={() => {
                      const loaded = loadScene(n);
                      if (loaded) {
                        setObjects(loaded.map((o) => hydrateObject(o)));
                        setSelectedIds([]);
                      }
                      setSketches(
                        loadSketches(n).map((s) =>
                          hydrateSketch(s as Partial<Sketch>),
                        ),
                      );
                      setDraft(null);
                      setSketchSel(null);
                    }}
                  >
                    Load
                  </Btn>
                  <Btn
                    onClick={() => {
                      deleteScene(n);
                      deleteSketches(n);
                      setScenes(listScenes());
                    }}
                  >
                    ✕
                  </Btn>

                </div>
              ))}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const focused = cat !== null;

  const helpEntry = helpId ? HELP[helpId] : null;

  return (
    <HintCtx.Provider value={setHelpId}>
    <main
      className="fixed inset-0 overflow-hidden bg-background text-foreground"
      onTouchStart={(e) => {
        if (clearHud && e.touches.length >= 3) setClearHud(false);
      }}
    >
      <h1 className="sr-only">Vector Bay — 3D CAD sketchpad</h1>

      <Canvas
        shadows
        camera={{ position: [0, 2.2, 9], fov: 62 }}
        style={{ touchAction: "none" }}
      >
        <Scene
          objects={objects}
          view={view}
          nav={nav}
          tool={tool}
          ghostSpec={ghostSpec}
          ghostScale={stretch}
          size={size}
          depth={depth}
          snap={snap}
          shapeSnap={shapeSnap}
          grid={grid}
          dragStep={dragStep}
          playing={playing}
          showGuides={showGuides}
          material={material}
          dragPlane={dragPlane}
          selectedIds={selectedIds}
          measureA={measureA}
          measureB={measureB}
          tapPoint={tapPoint}
          cutPreview={cutPreview}
          sketches={sketches}
          sketchDraft={draft}
          sketchSnap={sketchSnap}
          sketchSelectedId={sketchSel}
          sketchSelectedSeg={sketchSeg}
          onSketchTap={onSketchTap}
          onSketchPickSegment={onSketchPickSegment}
          onSketchMovePoint={onSketchMovePoint}
          onSketchMoveHandle={onSketchMoveHandle}
          onSelect={handleSelect}
          onSelectNone={() => setSelectedIds([])}
          onMove={handleMove}
          onMeasurePick={onMeasurePick}

          alignMode={alignMode}
          onTapTarget={onTapTarget}
          onCutPick={onCutPick}
          onLongPress={onLongPress}
        />
      </Canvas>



      {/* Clear-screen mode: only Add + a way back, over the bare world */}
      {clearHud && (
        <div className="absolute bottom-3 right-3 z-40 flex gap-1.5">
          <Btn onClick={place} hint="add">
            Add
          </Btn>
          <Btn onClick={() => setClearHud(false)} hint="clearHud">
            Show
          </Btn>
        </div>
      )}

      {/* Box-select capture layer */}
      {tool === "edit" && boxSelect && (
        <div
          className="absolute inset-0 z-30"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            rectActive.current = true;
            setRect({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
          }}
          onPointerMove={(e) => {
            if (!rectActive.current) return;
            setRect((r) => (r ? { ...r, x1: e.clientX, y1: e.clientY } : r));
          }}
          onPointerUp={finishRect}
          onPointerCancel={finishRect}
        >
          {rect && (
            <div
              className="absolute border border-accent bg-accent/10"
              style={{
                left: Math.min(rect.x0, rect.x1),
                top: Math.min(rect.y0, rect.y1),
                width: Math.abs(rect.x1 - rect.x0),
                height: Math.abs(rect.y1 - rect.y0),
              }}
            />
          )}
        </div>
      )}

      {/* Shape picker rides at the top whenever the Shapes tool is open */}
      {cat === "place" && !clearHud && <ShapeBar kind={kind} onPick={setKind} />}

      {/* Compact coordinate readout — replaces the old ruler overlay */}
      {!clearHud && <CoordChip />}

      {/* Top edge: one compact scrollable strip — categories first, then view/quick toggles.
          Always visible (unless the screen is cleared) so it never floats over the scene. */}
      {!clearHud && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-1 p-1.5">
          <div className="pointer-events-auto flex w-full gap-1 overflow-x-auto rounded-lg border border-grid-line bg-panel/80 px-1.5 py-1 backdrop-blur-md">
            {CATS.map((c) => (
              <Chip
                key={c.id}
                active={cat === c.id}
                onClick={() => openCat(c.id)}
                hint={CAT_HELP[c.id] ?? "step"}
              >
                {c.label}
              </Chip>
            ))}
            <Chip active={guideOpen} onClick={() => setGuideOpen(true)}>
              ? Guide
            </Chip>
            <span className="mx-0.5 w-px shrink-0 self-stretch bg-grid-line" />
            {VIEWS.map((v) => (
              <Chip
                key={v.id}
                active={view === v.id}
                onClick={() => setView(v.id)}
                hint="view"
              >
                {v.label}
              </Chip>
            ))}
            <Chip
              active={precision}
              onClick={() => setPrecision((p) => !p)}
              hint="fine"
            >
              Fine {precision ? "on" : "off"}
            </Chip>
            <Chip active={snap} onClick={() => setSnap((s) => !s)} hint="gridSnap">
              Snap {snap ? "on" : "off"}
            </Chip>
            <Btn onClick={undo} disabled={!objects.length} hint="undo">
              Undo
            </Btn>
            <Chip
              active={false}
              onClick={() => setClearHud(true)}
              hint="clearHud"
            >
              Clear
            </Chip>
          </div>
        </div>
      )}

      {/* Alignment readout — sits just under the top edge strip */}
      {alignedAxes.length > 0 && !clearHud && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-md border border-axis-y/60 bg-panel/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-axis-y backdrop-blur-md">
          aligned on {alignedAxes.join(" · ")}
        </div>
      )}

      {/* Bottom: focused strip or the category bar — hidden in clear mode */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col gap-2 p-2${clearHud ? " hidden" : ""}`}
      >
        {focused && !collapsed && (
          <div className="pointer-events-auto mx-auto w-full max-w-[440px] rounded-lg border border-grid-line bg-panel/90 px-2.5 py-2 shadow-hud backdrop-blur-md">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                {CATS.find((c) => c.id === cat)?.label}
              </span>
              <div className="flex gap-1.5">
                <Btn onClick={() => setCollapsed(true)}>Hide</Btn>
                <Btn onClick={() => setCat(null)}>✕</Btn>
              </div>
            </div>
            <div className="max-h-[30vh] overflow-y-auto">{stripBody()}</div>
          </div>
        )}

        {focused && collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="pointer-events-auto mx-auto rounded-full border border-grid-line bg-panel/85 px-6 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md"
          >
            {CATS.find((c) => c.id === cat)?.label} ▲
          </button>
        )}

        {/* Recent-shape quick bar */}
        {tool === "place" && recent.length > 0 && (!focused || cat === "place") && (
          <div className="pointer-events-auto mx-auto flex max-w-full gap-1.5 overflow-x-auto">
            {recent.map((r, i) => (
              <Chip key={i} active={false} onClick={() => applyRecent(r)}>
                {r.kind} {+r.size.toFixed(3)}
              </Chip>
            ))}
          </div>
        )}

        {/* Place / measure action button */}
        {(!focused || cat === "place" || cat === "measure") && (
          <div className="pointer-events-auto mx-auto flex items-center gap-2">
            {tool === "place" && (
              <>
                <button
                  type="button"
                  onClick={place}
                  onPointerDown={() => {
                    placeHold.current = setTimeout(() => {
                      placeFired.current = true;
                      setHelpId("place");
                    }, 500);
                  }}
                  onPointerUp={() => {
                    if (placeHold.current) clearTimeout(placeHold.current);
                  }}
                  onClickCapture={(e) => {
                    if (placeFired.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      placeFired.current = false;
                    }
                  }}
                  className="rounded-full border border-accent bg-accent/25 px-7 py-3 font-mono text-sm uppercase tracking-[0.2em] text-foreground shadow-glow backdrop-blur-md active:scale-95"
                >
                  {armed ? "Place here" : "Add"}
                </button>
                {armed && (
                  <Btn onClick={() => setArmed(false)} className="rounded-full">
                    Cancel
                  </Btn>
                )}
                {!armed && objects.length > 0 && (
                  <Btn onClick={repeat} className="rounded-full" hint="repeat">
                    Repeat
                  </Btn>
                )}
              </>
            )}
            {tool === "cut" && !focused && (
              <span className="rounded-full border border-grid-line bg-panel/85 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                tap a face to cut
              </span>
            )}
          </div>
        )}


        {/* Sticks — gesture mode keeps only the pivot-in-place Look stick */}
        {view === "fly" && sticks && (!focused || collapsed) && (
          <div className="flex items-end justify-between gap-2">
            {nav === "gesture" ? (
              <div className="pointer-events-none font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
                swipe to fly
                <br />
                pinch for depth
              </div>
            ) : (
              <div className="pointer-events-auto">
                <Joystick
                  label="move"
                  onChange={(x, y) => {
                    controls.move.x = x;
                    controls.move.y = y;
                  }}
                />
              </div>
            )}
            <div className="pointer-events-auto flex flex-col gap-1.5">
              <Btn onClick={() => {}} className="select-none" hint="lift">
                <span
                  onPointerDown={() => (controls.lift = 1)}
                  onPointerUp={() => (controls.lift = 0)}
                  onPointerLeave={() => (controls.lift = 0)}
                  className="block"
                >
                  ↑
                </span>
              </Btn>
              <Btn onClick={() => {}} className="select-none" hint="lift">
                <span
                  onPointerDown={() => (controls.lift = -1)}
                  onPointerUp={() => (controls.lift = 0)}
                  onPointerLeave={() => (controls.lift = 0)}
                  className="block"
                >
                  ↓
                </span>
              </Btn>
            </div>
            <div className="pointer-events-auto">
              <Joystick
                label="look"
                onChange={(x, y) => {
                  controls.look.x = x;
                  controls.look.y = y;
                }}
              />
            </div>
          </div>
        )}

      </div>

      {/* Long-press quick menu */}
      {quickMenu && (
        <div
          className="absolute z-50 flex items-center gap-1.5 rounded-lg border border-grid-line bg-panel/95 p-1.5 shadow-hud backdrop-blur-md"
          style={{
            left: Math.max(8, Math.min(quickMenu.x - 80, window.innerWidth - 260)),
            top: Math.max(8, quickMenu.y - 60),
          }}
        >
          <Btn
            onClick={() => {
              duplicateObjects(objects.filter((o) => o.id === quickMenu.id));
              setQuickMenu(null);
            }}
          >
            Dup
          </Btn>
          <Btn
            onClick={() => {
              setSelectedIds([quickMenu.id]);
              setQuickMenu(null);
              openCat("edit");
            }}
          >
            Edit
          </Btn>
          <Btn
            onClick={() => {
              setSelectedIds([quickMenu.id]);
              setQuickMenu(null);
              openCat("motion");
            }}
          >
            Motion
          </Btn>
          <Btn
            onClick={() => {
              setObjects((prev) => prev.filter((o) => o.id !== quickMenu.id));
              setSelectedIds((prev) => prev.filter((i) => i !== quickMenu.id));
              setQuickMenu(null);
            }}
          >
            Del
          </Btn>
          <Btn onClick={() => setQuickMenu(null)}>✕</Btn>
        </div>
      )}

      {/* Long-press description popover */}
      {helpEntry && (
        <button
          type="button"
          onClick={() => setHelpId(null)}
          className="absolute inset-0 z-[60] flex items-end justify-center bg-background/40 p-4 backdrop-blur-[2px]"
        >
          <span className="mb-24 block max-w-[420px] rounded-lg border border-accent/60 bg-panel/95 p-3 text-left shadow-hud">
            <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              {helpEntry.title}
            </span>
            <span className="mt-1 block font-mono text-[11px] leading-relaxed text-muted-foreground">
              {helpEntry.body}
            </span>
            <span className="mt-2 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
              tap anywhere to close · long-press any control for its description
            </span>
          </span>
        </button>
      )}

      {/* Full control guide */}
      {guideOpen && (
        <div className="absolute inset-0 z-[60] flex flex-col bg-background/95 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              Control guide
            </span>
            <Btn onClick={() => setGuideOpen(false)}>Close</Btn>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {HELP_ORDER.map((id) => {
              const e = HELP[id];
              if (!e) return null;
              return (
                <div
                  key={id}
                  className="rounded-md border border-grid-line bg-panel/70 p-2"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
                    {e.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {e.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selection readout */}
      {selectedIds.length > 0 && !focused && !clearHud && (
        <div className="pointer-events-none absolute right-3 top-14 z-40 rounded-md border border-grid-line bg-panel/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-md">
          {selectedIds.length} selected · c {selectionCenter.x.toFixed(2)}/
          {selectionCenter.y.toFixed(2)}/{selectionCenter.z.toFixed(2)}
        </div>
      )}
    </main>
    </HintCtx.Provider>
  );
}

/** Live world position of the screen-centre cursor, in one small chip. */
function CoordChip() {
  const [p, setP] = useState<[number, number, number]>([0, 0, 0]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setP((prev) => {
        const n: [number, number, number] = [
          +centerPoint.x.toFixed(2),
          +centerPoint.y.toFixed(2),
          +centerPoint.z.toFixed(2),
        ];
        return n[0] === prev[0] && n[1] === prev[1] && n[2] === prev[2] ? prev : n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="pointer-events-none absolute right-1 top-14 z-30 rounded-md border border-grid-line bg-panel/80 px-2 py-0.5 font-mono text-[10px] backdrop-blur-md">
      <span className="text-axis-x">x {p[0].toFixed(2)}</span>
      <span className="text-axis-y"> · y {p[1].toFixed(2)}</span>
      <span className="text-axis-z"> · z {p[2].toFixed(2)}</span>
    </div>
  );
}
