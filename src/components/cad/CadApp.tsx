import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Joystick } from "./Joystick";
import { AxisHud } from "./AxisHud";
import { Scene, type CutPreview } from "./Scene";
import {
  is2D,
  SHAPES_2D,
  SHAPES_3D,
  type GeometrySpec,
  type Shape2D,
  type ShapeKind,
} from "./geometry";
import {
  alignmentsFor,
  centerPoint,
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
  sceneRefs,
  selectionFocusState,
  SNAP,
  STEPS,
  SWATCHES,
  tapTarget,
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
  deleteScene,
  listScenes,
  loadAuto,
  loadScene,
  saveScene,
} from "@/lib/scene-store";
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
  { id: "place", label: "Place", tool: "place" },
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

const ROT_STEPS = [1, 5, 15, 90];
const PREFS_KEY = "vb.controls.v1";

function Chip({
  active,
  onClick,
  children,
  className = "",
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
  const [kind, setKind] = useState<ShapeKind>("box");
  const [size, setSize] = useState(1);
  const [stretch, setStretch] = useState<[number, number, number]>([1, 1, 1]);
  const [lockStretch, setLockStretch] = useState(true);
  const [sides, setSides] = useState(6);
  const [curve, setCurve] = useState(0);
  const [extrude, setExtrude] = useState(0);
  const [bend, setBend] = useState(0);
  const [bendAxis, setBendAxis] = useState<0 | 1 | 2>(1);
  const [taper, setTaper] = useState(0);
  const [step, setStep] = useState(0.1);
  const [rotStep, setRotStep] = useState(90);
  const [depth, setDepth] = useState(6);
  const [snap, setSnap] = useState(true);
  const [shapeSnap, setShapeSnap] = useState(true);
  const [blockOverlap, setBlockOverlap] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [dragStep, setDragStep] = useState(0);
  const [material, setMaterial] = useState<Material>(DEFAULT_MATERIAL);
  const [dragPlane, setDragPlane] = useState<DragPlaneMode>("horizontal");
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
    curve: number;
    extrude: number;
    bend: number;
    bendAxis: 0 | 1 | 2;
    taper: number;
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

  const grid = snap ? Math.max(step, 0.001) : SNAP;

  useEffect(() => {
    const restored = loadAuto();
    if (restored?.length) setObjects(restored);
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
    () => ({ kind, sides, curve, extrude, bend, bendAxis, taper, profile: null }),
    [kind, sides, curve, extrude, bend, bendAxis, taper],
  );

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
    const p = centerPoint;
    const next = makeObject(kind, [p.x, p.y, p.z], size, material, {
      scale: [...stretch] as [number, number, number],
      sides,
      curve,
      extrude,
      bend,
      bendAxis,
      taper,
    });
    if (wouldCollide(next, [])) {
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
      curve,
      extrude,
      bend,
      bendAxis,
      taper,
    };
    setRecent((prev) => {
      const key = JSON.stringify(spec);
      return [spec, ...prev.filter((r) => JSON.stringify(r) !== key)].slice(0, 4);
    });
    clearTap();
  };

  const applyRecent = (r: RecentSpec) => {
    setKind(r.kind);
    setSize(r.size);
    setStretch([...r.stretch] as [number, number, number]);
    setLockStretch(false);
    setSides(r.sides);
    setCurve(r.curve);
    setExtrude(r.extrude);
    setBend(r.bend);
    setBendAxis(r.bendAxis);
    setTaper(r.taper);
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
        const dx = pos[0] - target.position[0];
        const dy = pos[1] - target.position[1];
        const dz = pos[2] - target.position[2];
        if (!dx && !dy && !dz) return prev;
        const ids =
          selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
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
            if (mdx || mdy || mdz) {
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
        if (blockOverlap) {
          const others = moved.filter((o) => !ids.includes(o.id));
          const boxes = others.map((o) => worldBoxOf(o));
          const hit = moved
            .filter((o) => ids.includes(o.id))
            .some((o) => {
              const b = worldBoxOf(o);
              return boxes.some((ob) => boxesOverlap(b, ob));
            });
          if (hit) return prev;
        }
        return moved;
      });
    },
    [selectedIds, blockOverlap, magnet, grid],
  );

  const onTapTarget = useCallback((p: THREE.Vector3, n: THREE.Vector3) => {
    if (tapTarget.point && tapTarget.point.distanceTo(p) < 0.001) {
      tapTarget.point = null;
      tapTarget.normal = null;
      setTapPoint(null);
      return;
    }
    const point = p.clone();
    tapTarget.point = point;
    tapTarget.normal = n.clone();
    setTapPoint([point.x, point.y, point.z]);
  }, []);

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
        curve,
        extrude: is2D(kind) ? 1 : 0,
        bend: 0,
        bendAxis: 1,
        taper: 0,
        profile: null,
      },
      ...cutTransform,
    };
  }, [cutPick, cutTransform, kind, sides, curve]);

  const applyCut = () => {
    if (!cutPick || !cutTransform) return;
    const op: CutOp = {
      id: crypto.randomUUID(),
      op: "subtract",
      kind,
      sides,
      curve,
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
      curve: t.curve ?? 0,
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
    updateSelected((o) => {
      const position = [...o.position] as [number, number, number];
      position[axis] = +((position[axis] ?? 0) + amount).toFixed(6);
      return { ...o, position };
    });
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
    const copies = list.map((o) => cloneObject(o, snap ? grid : 0.25));
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
            curve: THREE.MathUtils.clamp(s.curve, 0, 1),
            extrude: Math.max(0, s.extrude),
            bend: s.bend,
            taper: THREE.MathUtils.clamp(s.taper, 0, 1),
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
          curve: THREE.MathUtils.clamp(s.curve, 0, 1),
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

  const stripBody = () => {
    switch (cat) {
      case "move":
        return (
          <>
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

      case "place":
        return (
          <>
            <div className="max-h-24 overflow-y-auto">
              {shapeList(SHAPES_3D)}
              <div className="h-1" />
              {shapeList(SHAPES_2D)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {stepRow}
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
            <div className="mt-1.5">
              <div className="mb-1 flex items-center gap-2">
                <Chip active={lockStretch} onClick={() => setLockStretch((l) => !l)}>
                  {lockStretch ? "uniform" : "free"}
                </Chip>
                {is2D(kind) && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    extrude for a solid
                  </span>
                )}
              </div>
              {lockStretch ? (
                <NumRow
                  label="size"
                  value={size}
                  min={0.001}
                  max={40}
                  step={step}
                  onChange={setSize}
                />
              ) : (
                (["x", "y", "z"] as const).map((ax, i) => (
                  <NumRow
                    key={ax}
                    label={ax}
                    value={stretch[i] ?? 1}
                    min={0.001}
                    max={40}
                    step={step}
                    onChange={(v) =>
                      setStretch((s) => {
                        const n = [...s] as [number, number, number];
                        n[i] = v;
                        return n;
                      })
                    }
                  />
                ))
              )}
              {is2D(kind) && (
                <NumRow
                  label="extrude"
                  value={extrude}
                  min={0}
                  max={20}
                  step={step}
                  onChange={setExtrude}
                />
              )}
              <NumRow
                label="sides"
                value={sides}
                min={3}
                max={24}
                step={1}
                onChange={(v) => setSides(Math.round(v))}
                unit=""
              />
              <NumRow
                label="curve"
                value={curve}
                min={0}
                max={1}
                step={0.05}
                onChange={setCurve}
                unit=""
              />
              <NumRow
                label="bend"
                value={bend}
                min={-2}
                max={2}
                step={0.05}
                onChange={setBend}
                unit="r"
              />
              <NumRow
                label="taper"
                value={taper}
                min={0}
                max={1}
                step={0.05}
                onChange={setTaper}
                unit=""
              />
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                  bend axis
                </span>
                {(["X", "Y", "Z"] as const).map((l, i) => (
                  <Chip
                    key={l}
                    active={bendAxis === i}
                    onClick={() => setBendAxis(i as 0 | 1 | 2)}
                  >
                    {l}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        );

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
              <Btn onClick={duplicate} disabled={!selectedIds.length}>
                Dup
              </Btn>
              <Btn onClick={groupSelected} disabled={selectedIds.length < 2}>
                Group
              </Btn>
              <Btn onClick={ungroupSelected} disabled={!selectedIds.length}>
                Ungrp
              </Btn>
              <Btn onClick={() => booleanSelected("union")} disabled={selectedIds.length < 2}>
                Join
              </Btn>
              <Btn onClick={() => booleanSelected("subtract")} disabled={selectedIds.length < 2}>
                Sub
              </Btn>
              <Btn onClick={undoLastCut}>Uncut</Btn>
              <Btn onClick={removeSelected} disabled={!selectedIds.length}>
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
                  <Btn onClick={applyCut}>Apply cut</Btn>
                  <Btn onClick={() => setCutPick(null)}>Cancel</Btn>
                </>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                  Tap the face you want to cut into.
                </span>
              )}
              <Btn onClick={undoLastCut}>Undo cut</Btn>
            </div>
          </>
        );

      case "snap":
        return (
          <>
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              <Chip active={snap} onClick={() => setSnap((s) => !s)}>
                Grid snap {snap ? "on" : "off"}
              </Chip>
              <Chip active={shapeSnap} onClick={() => setShapeSnap((s) => !s)}>
                Shape snap {shapeSnap ? "on" : "off"}
              </Chip>
              <Chip active={blockOverlap} onClick={() => setBlockOverlap((b) => !b)}>
                {blockOverlap ? "Block overlap" : "Allow overlap"}
              </Chip>
              <Chip active={showGuides} onClick={() => setShowGuides((g) => !g)}>
                Align guides {showGuides ? "on" : "off"}
              </Chip>
              <Chip active={magnet} onClick={() => setMagnet((m) => !m)}>
                Magnet {magnet ? "on" : "off"}
              </Chip>
              <Chip active={!!tapPoint} onClick={clearTap}>
                {tapPoint ? "Clear tap target" : "No tap target"}
              </Chip>
            </div>
            {stepRow}
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
              Grid snap rounds to the active step ({step}m). Shape snap pulls to
              corners, edge midpoints and face centers of nearby objects.
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
                    }}
                  >
                    Load
                  </Btn>
                  <Btn
                    onClick={() => {
                      deleteScene(n);
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

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <h1 className="sr-only">Vector Bay — 3D CAD sketchpad</h1>

      <Canvas
        shadows
        camera={{ position: [0, 2.2, 9], fov: 62 }}
        style={{ touchAction: "none" }}
      >
        <Scene
          objects={objects}
          view={view}
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
          onSelect={handleSelect}
          onSelectNone={() => setSelectedIds([])}
          onMove={handleMove}
          onMeasurePick={onMeasurePick}
          onTapTarget={onTapTarget}
          onCutPick={onCutPick}
          onLongPress={onLongPress}
        />
      </Canvas>

      <AxisHud step={step} />

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

      {/* Top bar — hidden while a toolbar strip is open */}
      {!focused && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto flex gap-1.5">
            {VIEWS.map((v) => (
              <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
                {v.label}
              </Chip>
            ))}
          </div>
          <div className="pointer-events-auto flex gap-1.5">
            <Chip active={precision} onClick={() => setPrecision((p) => !p)}>
              Fine {precision ? "on" : "off"}
            </Chip>
            <Chip active={snap} onClick={() => setSnap((s) => !s)}>
              Snap {snap ? "on" : "off"}
            </Chip>
            <Btn onClick={undo} disabled={!objects.length}>
              Undo
            </Btn>
          </div>
        </div>
      )}

      {/* Alignment readout */}
      {alignedAxes.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-md border border-axis-y/60 bg-panel/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-axis-y backdrop-blur-md">
          aligned on {alignedAxes.join(" · ")}
        </div>
      )}

      {/* Bottom: focused strip or the category bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col gap-2 p-2">
        {focused && !collapsed && (
          <div className="pointer-events-auto mx-auto w-full max-w-[520px] rounded-lg border border-grid-line bg-panel/95 px-2.5 py-2 shadow-hud backdrop-blur-md">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                {CATS.find((c) => c.id === cat)?.label}
              </span>
              <div className="flex gap-1.5">
                <Btn onClick={() => setCollapsed(true)}>Hide</Btn>
                <Btn onClick={() => setCat(null)}>✕</Btn>
              </div>
            </div>
            <div className="max-h-[42vh] overflow-y-auto">{stripBody()}</div>
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
                  <Btn onClick={repeat} className="rounded-full">
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

        {/* Category bar */}
        <div className="pointer-events-auto mx-auto flex w-full max-w-[520px] gap-1.5 overflow-x-auto rounded-lg border border-grid-line bg-panel/85 px-2 py-1.5 backdrop-blur-md">
          {CATS.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => openCat(c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>

        {/* Joysticks */}
        {view === "fly" && sticks && (!focused || collapsed) && (
          <div className="flex items-end justify-between gap-2">
            <div className="pointer-events-auto">
              <Joystick
                label="move"
                onChange={(x, y) => {
                  controls.move.x = x;
                  controls.move.y = y;
                }}
              />
            </div>
            <div className="pointer-events-auto flex flex-col gap-1.5">
              <Btn onClick={() => {}} className="select-none">
                <span
                  onPointerDown={() => (controls.lift = 1)}
                  onPointerUp={() => (controls.lift = 0)}
                  onPointerLeave={() => (controls.lift = 0)}
                  className="block"
                >
                  ↑
                </span>
              </Btn>
              <Btn onClick={() => {}} className="select-none">
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
                label="pivot"
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

      {/* Selection readout */}
      {selectedIds.length > 0 && !focused && (
        <div className="pointer-events-none absolute right-3 top-14 z-40 rounded-md border border-grid-line bg-panel/85 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-md">
          {selectedIds.length} selected · c {selectionCenter.x.toFixed(2)}/
          {selectionCenter.y.toFixed(2)}/{selectionCenter.z.toFixed(2)}
        </div>
      )}
    </main>
  );
}
