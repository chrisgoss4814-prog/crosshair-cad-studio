import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Joystick } from "./Joystick";
import { AxisHud } from "./AxisHud";
import { Scene } from "./Scene";
import {
  is2D,
  SHAPES_2D,
  SHAPES_3D,
  type GeometrySpec,
  type Shape2D,
  type ShapeKind,
} from "./geometry";
import {
  centerPoint,
  centroid,
  cloneObject,
  controls,
  DEFAULT_MATERIAL,
  hydrateObject,
  makeObject,
  sceneRefs,
  SNAP,
  STEPS,
  SWATCHES,
  tapTarget,
  type CutOp,
  type DragPlaneMode,
  type Material,
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

const TOOLS: { id: ToolMode; label: string }[] = [
  { id: "place", label: "Place" },
  { id: "edit", label: "Edit" },
  { id: "cut", label: "Cut" },
  { id: "measure", label: "Meas" },
];

const ROT_STEPS = [1, 5, 15, 90];

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

type PanelId = "none" | "style" | "scenes" | "shape" | "ai" | "settings";

export function CadApp() {
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [view, setView] = useState<ViewMode>("fly");
  const [tool, setTool] = useState<ToolMode>("place");
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
  const [step, setStep] = useState(1);
  const [rotStep, setRotStep] = useState(90);
  const [depth, setDepth] = useState(6);
  const [snap, setSnap] = useState(true);
  const [shapeSnap, setShapeSnap] = useState(true);
  const [material, setMaterial] = useState<Material>(DEFAULT_MATERIAL);
  const [dragPlane, setDragPlane] = useState<DragPlaneMode>("horizontal");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [boxSelect, setBoxSelect] = useState(false);
  const [panel, setPanel] = useState<PanelId>("none");
  const [measureA, setMeasureA] = useState<[number, number, number] | null>(null);
  const [measureB, setMeasureB] = useState<[number, number, number] | null>(null);
  const [tapPoint, setTapPoint] = useState<[number, number, number] | null>(null);
  const [speed, setSpeed] = useState(1);
  const [precision, setPrecision] = useState(false);
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
  }, []);

  useEffect(() => {
    autoSave(objects);
  }, [objects]);

  useEffect(() => {
    controls.speed = speed;
    controls.precision = precision;
  }, [speed, precision]);

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

  const place = () => {
    const p = centerPoint;
    setObjects((prev) => [
      ...prev,
      makeObject(kind, [p.x, p.y, p.z], size, material, {
        scale: [...stretch] as [number, number, number],
        sides,
        curve,
        extrude,
        bend,
        bendAxis,
        taper,
      }),
    ]);
    clearTap();
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
        const ids =
          selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
        return prev.map((o) =>
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
      });
    },
    [selectedIds],
  );

  const onTapTarget = useCallback((p: THREE.Vector3, n: THREE.Vector3) => {
    if (tapTarget.point && tapTarget.point.distanceTo(p) < 0.001) {
      tapTarget.point = null;
      tapTarget.normal = null;
      setTapPoint(null);
      return;
    }
    const point = p.clone().addScaledVector(n, 0);
    tapTarget.point = point;
    tapTarget.normal = n.clone();
    setTapPoint([point.x, point.y, point.z]);
  }, []);

  /** Cut tool: subtract the active shape (at the tapped point) from an object. */
  const onCutPick = useCallback(
    (id: string, p: THREE.Vector3) => {
      const op: CutOp = {
        id: crypto.randomUUID(),
        op: "subtract",
        kind,
        sides,
        curve,
        extrude,
        position: [p.x, p.y, p.z],
        rotation: [0, 0, 0],
        scale: [...stretch] as [number, number, number],
      };
      setObjects((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ops: [...(o.ops ?? []), op] } : o)),
      );
      toast.success(`Cut ${kind} hole`);
    },
    [kind, sides, curve, extrude, stretch],
  );

  const undoLastCut = () => {
    updateSelected((o) => ({ ...o, ops: (o.ops ?? []).slice(0, -1) }));
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

  const nudge = (axis: 0 | 1 | 2, dir: 1 | -1) => {
    updateSelected((o) => {
      const position = [...o.position] as [number, number, number];
      position[axis] = +(position[axis] + dir * step).toFixed(6);
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
      scale[axis] = Math.max(0.001, +(scale[axis] + dir * step).toFixed(6));
      return { ...o, scale };
    });
  };

  const rotate = (axis: 0 | 1 | 2, dir: 1 | -1) => {
    const rad = (rotStep * Math.PI) / 180;
    updateSelected((o) => {
      const rotation = [...o.rotation] as [number, number, number];
      rotation[axis] = +(rotation[axis] + dir * rad).toFixed(6);
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

  const duplicate = () => {
    if (!selectedObjects.length) return;
    const copies = selectedObjects.map((o) => cloneObject(o, snap ? grid : 0.25));
    setObjects((prev) => [...prev, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  };

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

  const doSave = () => {
    const name = sceneName.trim() || `scene-${scenes.length + 1}`;
    saveScene(name, objects);
    setScenes(listScenes());
    setSceneName("");
  };

  // --- AI builder -----------------------------------------------------------
  const sceneSummary = () =>
    objects
      .slice(-40)
      .map(
        (o) =>
          `${o.kind} at ${o.position.map((v) => v.toFixed(2)).join(",")} size ${(
            o.scale ?? [o.size, o.size, o.size]
          )
            .map((v) => v.toFixed(2))
            .join("x")}`,
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
          extrude: Math.max(0, s.extrude),
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
    setAiSummary(null);
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
      setPrompt("");
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
          onClick={() => {
            setKind(k as ShapeKind);
            if (is2D(k as ShapeKind) && extrude === 0) setExtrude(0);
          }}
        >
          {k}
        </Chip>
      ))}
    </div>
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <h1 className="sr-only">Vector Bay — 3D CAD sketchpad</h1>

      <Canvas shadows camera={{ position: [0, 2.2, 9], fov: 62 }}>
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
          material={material}
          dragPlane={dragPlane}
          selectedIds={selectedIds}
          measureA={measureA}
          measureB={measureB}
          tapPoint={tapPoint}
          onSelect={handleSelect}
          onSelectNone={() => setSelectedIds([])}
          onMove={handleMove}
          onMeasurePick={onMeasurePick}
          onTapTarget={onTapTarget}
          onCutPick={onCutPick}
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

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex gap-1.5">
          {VIEWS.map((v) => (
            <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </Chip>
          ))}
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5">
          {TOOLS.map((t) => (
            <Chip
              key={t.id}
              active={tool === t.id}
              onClick={() => {
                setTool(t.id);
                if (t.id !== "measure") resetMeasure();
                if (t.id !== "place") clearTap();
              }}
            >
              {t.label}
            </Chip>
          ))}
          <Chip
            active={panel === "ai"}
            onClick={() => setPanel(panel === "ai" ? "none" : "ai")}
          >
            AI
          </Chip>
          <Chip
            active={panel === "scenes"}
            onClick={() => setPanel(panel === "scenes" ? "none" : "scenes")}
          >
            Files
          </Chip>
        </div>
      </div>

      {/* Left rail: depth + lift */}
      <div className="pointer-events-auto absolute left-3 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1.5">
        <Btn onClick={() => setDepth((d) => +(d + 1).toFixed(2))}>D+</Btn>
        <span className="text-center font-mono text-[10px] text-muted-foreground">
          {depth.toFixed(1)}m
        </span>
        <Btn onClick={() => setDepth((d) => Math.max(1, +(d - 1).toFixed(2)))}>D−</Btn>
        {view === "fly" && (
          <>
            <div className="my-1 h-px bg-grid-line" />
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
          </>
        )}
      </div>

      {/* Right rail */}
      <div className="pointer-events-auto absolute right-3 top-1/2 z-40 flex max-h-[62vh] -translate-y-1/2 flex-col gap-1.5 overflow-y-auto">
        {(tool === "place" || tool === "cut") && (
          <Chip
            active={panel === "shape"}
            onClick={() => setPanel(panel === "shape" ? "none" : "shape")}
          >
            Shapes
          </Chip>
        )}

        {tool === "edit" && (
          <>
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
            <Btn onClick={() => booleanSelected("union")} disabled={selectedIds.length < 2}>
              Join
            </Btn>
            <Btn
              onClick={() => booleanSelected("subtract")}
              disabled={selectedIds.length < 2}
            >
              Sub
            </Btn>
            <Btn
              onClick={() => booleanSelected("intersect")}
              disabled={selectedIds.length < 2}
            >
              Isect
            </Btn>
            <Btn onClick={undoLastCut} disabled={!selectedIds.length}>
              Uncut
            </Btn>
            <Btn onClick={groupSelected} disabled={selectedIds.length < 2}>
              Group
            </Btn>
            <Btn onClick={ungroupSelected} disabled={!selectedIds.length}>
              Ungrp
            </Btn>
            <Btn onClick={removeSelected} disabled={!selectedIds.length}>
              Del
            </Btn>
          </>
        )}

        {tool === "measure" && <Btn onClick={resetMeasure}>Clear</Btn>}

        <Chip
          active={panel === "style"}
          onClick={() => setPanel(panel === "style" ? "none" : "style")}
        >
          Style
        </Chip>
        <Chip
          active={panel === "settings"}
          onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
        >
          Ctrl
        </Chip>
      </div>

      {/* Shape / form panel */}
      {panel === "shape" && (
        <div className="pointer-events-auto absolute right-3 top-14 z-40 max-h-[68vh] w-[min(92vw,340px)] overflow-y-auto rounded-lg border border-grid-line bg-panel/95 p-3 shadow-hud backdrop-blur-md">
          <button type="button" onClick={() => setPanel("none")} aria-label="close panel" className="float-right -mt-1 rounded-md border border-grid-line px-2 py-0.5 font-mono text-[11px] text-muted-foreground">✕</button>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            solids
          </p>
          {shapeList(SHAPES_3D)}
          <p className="mb-1 mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            2d profiles
          </p>
          {shapeList(SHAPES_2D)}

          <div className="mt-3 space-y-1">
            {is2D(kind) && (
              <Slider
                label="extrude"
                value={extrude}
                min={0}
                max={10}
                step={0.05}
                onChange={setExtrude}
                format={(v) => `${v.toFixed(2)}m`}
              />
            )}
            <Slider
              label="sides"
              value={sides}
              min={3}
              max={24}
              step={1}
              onChange={setSides}
              format={(v) => String(v)}
            />
            <Slider label="curve" value={curve} min={0} max={1} step={0.05} onChange={setCurve} />
            <Slider
              label="bend"
              value={bend}
              min={-2}
              max={2}
              step={0.05}
              onChange={setBend}
              format={(v) => `${((v * 180) / Math.PI).toFixed(0)}°`}
            />
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="w-14 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                axis
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
            <Slider label="taper" value={taper} min={0} max={1} step={0.05} onChange={setTaper} />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                stretch
              </span>
              <Chip active={lockStretch} onClick={() => setLockStretch((l) => !l)}>
                {lockStretch ? "uniform" : "free"}
              </Chip>
            </div>
            {(["x", "y", "z"] as const).map((ax, i) => (
              <Slider
                key={ax}
                label={ax}
                value={stretch[i] ?? 1}
                min={0.05}
                max={20}
                step={0.05}
                onChange={(v) => {
                  setLockStretch(false);
                  setStretch((s) => {
                    const n = [...s] as [number, number, number];
                    n[i] = v;
                    return n;
                  });
                }}
                format={(v) => `${v.toFixed(2)}m`}
              />
            ))}
          </div>

          {tool === "edit" && selectedIds.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                apply profile to selection
              </p>
              <div className="flex flex-wrap gap-1.5">
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
          )}
        </div>
      )}

      {/* Controls panel */}
      {panel === "settings" && (
        <div className="pointer-events-auto absolute right-3 top-14 z-40 max-h-[68vh] w-[min(92vw,340px)] overflow-y-auto rounded-lg border border-grid-line bg-panel/95 p-3 shadow-hud backdrop-blur-md">
          <button type="button" onClick={() => setPanel("none")} aria-label="close panel" className="float-right -mt-1 rounded-md border border-grid-line px-2 py-0.5 font-mono text-[11px] text-muted-foreground">✕</button>
          <Slider
            label="speed"
            value={speed}
            min={0.1}
            max={2}
            step={0.05}
            onChange={setSpeed}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <div className="flex flex-wrap gap-1.5">
            <Chip active={precision} onClick={() => setPrecision((p) => !p)}>
              Precision {precision ? "on" : "off"}
            </Chip>
            <Chip active={shapeSnap} onClick={() => setShapeSnap((s) => !s)}>
              Shape snap {shapeSnap ? "on" : "off"}
            </Chip>
            <Chip active={!!tapPoint} onClick={clearTap}>
              {tapPoint ? "Clear tap target" : "No tap target"}
            </Chip>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            Precision drops joystick speed to 15% for fine positioning. In Place mode,
            tap any face to pin the next shape there.
          </p>
        </div>
      )}

      {/* AI panel */}
      {panel === "ai" && (
        <div className="pointer-events-auto absolute right-3 top-14 z-40 w-[min(92vw,340px)] rounded-lg border border-grid-line bg-panel/95 p-3 shadow-hud backdrop-blur-md">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. a 4m brick wall with an arched doorway"
            rows={3}
            className="w-full resize-none rounded-md border border-grid-line bg-background/60 px-2 py-1.5 font-mono text-[11px] outline-none focus:border-accent"
          />
          <div className="mt-1.5 flex gap-1.5">
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
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {aiSummary} — {aiSteps.length} steps.
            </p>
          )}
          <div className="mt-3 border-t border-grid-line pt-2">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              builder memory
            </p>
            <input
              value={prefs.notes}
              onChange={(e) => {
                const next = { ...prefs, notes: e.target.value };
                setPrefs(next);
                savePrefs(next);
              }}
              placeholder="style notes it should always follow"
              className="w-full rounded-md border border-grid-line bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
            />
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Keeps your preferences and every kept/undone build as context, so it
              matches how you build over time.
            </p>
          </div>
        </div>
      )}

      {/* Style panel */}
      {panel === "style" && (
        <div className="pointer-events-auto absolute right-3 top-14 z-40 max-h-[68vh] w-[min(92vw,340px)] overflow-y-auto rounded-lg border border-grid-line bg-panel/95 p-3 shadow-hud backdrop-blur-md">
          <button type="button" onClick={() => setPanel("none")} aria-label="close panel" className="float-right -mt-1 rounded-md border border-grid-line px-2 py-0.5 font-mono text-[11px] text-muted-foreground">✕</button>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`color ${c}`}
                onClick={() => {
                  const next = { ...material, color: c };
                  setMaterial(next);
                  if (tool === "edit") applyMaterialToSelected(next);
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
                if (tool === "edit") applyMaterialToSelected(next);
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
                if (tool === "edit") applyMaterialToSelected(next);
              }}
            />
          ))}
        </div>
      )}

      {/* Scenes panel */}
      {panel === "scenes" && (
        <div className="pointer-events-auto absolute right-3 top-14 z-40 w-[min(88vw,280px)] rounded-lg border border-grid-line bg-panel/95 p-3 shadow-hud backdrop-blur-md">
          <div className="mb-2 flex gap-1.5">
            <input
              value={sceneName}
              onChange={(e) => setSceneName(e.target.value)}
              placeholder="scene name"
              className="min-w-0 flex-1 rounded-md border border-grid-line bg-background/60 px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
            />
            <Btn onClick={doSave}>Save</Btn>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
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
          <div className="mt-2 flex gap-1.5">
            <Btn
              onClick={() => {
                setObjects([]);
                setSelectedIds([]);
              }}
            >
              New
            </Btn>
            <span className="self-center font-mono text-[10px] text-muted-foreground">
              {objects.length} objects
            </span>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col gap-2 p-3">
        <div className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-grid-line bg-panel/85 px-2 py-1.5 backdrop-blur-md">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            step
          </span>
          {STEPS.map((s) => (
            <Chip key={s} active={step === s} onClick={() => setStep(s)}>
              {s}
            </Chip>
          ))}
          <div className="mx-1 h-4 w-px bg-grid-line" />
          <Btn
            onClick={() =>
              tool === "edit"
                ? resizeSelected(-1)
                : setSize((v) => {
                    const n = Math.max(0.001, +(v - step).toFixed(6));
                    setLockStretch(true);
                    return n;
                  })
            }
          >
            −
          </Btn>
          <span className="min-w-16 text-center font-mono text-[11px]">
            {size.toFixed(3)}
          </span>
          <Btn
            onClick={() =>
              tool === "edit"
                ? resizeSelected(1)
                : setSize((v) => {
                    const n = +(v + step).toFixed(6);
                    setLockStretch(true);
                    return n;
                  })
            }
          >
            +
          </Btn>
        </div>

        {tool === "edit" && selectedIds.length > 0 && (
          <div className="pointer-events-auto mx-auto flex max-h-32 flex-wrap items-center justify-center gap-1.5 overflow-y-auto rounded-lg border border-grid-line bg-panel/85 px-2 py-1.5 backdrop-blur-md">
            {(
              [
                [0, "X", "text-axis-x"],
                [1, "Y", "text-axis-y"],
                [2, "Z", "text-axis-z"],
              ] as const
            ).map(([axis, label, cls]) => (
              <span key={label} className="flex items-center gap-1">
                <Btn onClick={() => nudge(axis, -1)}>−</Btn>
                <span className={`font-mono text-[11px] ${cls}`}>{label}</span>
                <Btn onClick={() => nudge(axis, 1)}>+</Btn>
              </span>
            ))}
            <div className="mx-1 h-4 w-px bg-grid-line" />
            {(
              [
                [0, "sX"],
                [1, "sY"],
                [2, "sZ"],
              ] as const
            ).map(([axis, label]) => (
              <span key={label} className="flex items-center gap-1">
                <Btn onClick={() => stretchSelected(axis, -1)}>−</Btn>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {label}
                </span>
                <Btn onClick={() => stretchSelected(axis, 1)}>+</Btn>
              </span>
            ))}
            <div className="mx-1 h-4 w-px bg-grid-line" />
            {ROT_STEPS.map((r) => (
              <Chip key={r} active={rotStep === r} onClick={() => setRotStep(r)}>
                {r}°
              </Chip>
            ))}
            {(
              [
                [0, "rX"],
                [1, "rY"],
                [2, "rZ"],
              ] as const
            ).map(([axis, label]) => (
              <span key={label} className="flex items-center gap-1">
                <Btn onClick={() => rotate(axis, -1)}>↺</Btn>
                <span className="font-mono text-[11px]">{label}</span>
                <Btn onClick={() => rotate(axis, 1)}>↻</Btn>
              </span>
            ))}
            <span className="font-mono text-[10px] text-muted-foreground">
              c {selectionCenter.x.toFixed(2)}/{selectionCenter.y.toFixed(2)}/
              {selectionCenter.z.toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex items-end justify-between gap-2">
          {view === "fly" ? (
            <div className="pointer-events-auto">
              <Joystick
                label="move"
                onChange={(x, y) => {
                  controls.move.x = x;
                  controls.move.y = y;
                }}
              />
            </div>
          ) : (
            <div className="w-1" />
          )}

          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            <div className="flex gap-1.5">
              <Chip active={snap} onClick={() => setSnap((s) => !s)}>
                Snap {snap ? "on" : "off"}
              </Chip>
              <Chip active={precision} onClick={() => setPrecision((p) => !p)}>
                Slow
              </Chip>
              <Btn onClick={undo} disabled={!objects.length}>
                Undo
              </Btn>
            </div>
            {tool === "place" && (
              <button
                type="button"
                onClick={place}
                className="rounded-full border border-accent bg-accent/25 px-7 py-3 font-mono text-sm uppercase tracking-[0.2em] text-foreground shadow-glow backdrop-blur-md active:scale-95"
              >
                Add
              </button>
            )}
            {tool === "measure" && (
              <button
                type="button"
                onClick={() => onMeasurePick(centerPoint.clone())}
                className="rounded-full border border-accent bg-accent/25 px-6 py-3 font-mono text-sm uppercase tracking-[0.2em] text-foreground shadow-glow backdrop-blur-md active:scale-95"
              >
                Mark
              </button>
            )}
            {tool === "cut" && (
              <span className="rounded-full border border-grid-line bg-panel/85 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                tap a solid to cut
              </span>
            )}
          </div>

          {view === "fly" ? (
            <div className="pointer-events-auto">
              <Joystick
                label="pivot"
                onChange={(x, y) => {
                  controls.look.x = x;
                  controls.look.y = y;
                }}
              />
            </div>
          ) : (
            <div className="w-1" />
          )}
        </div>
      </div>
    </main>
  );
}
