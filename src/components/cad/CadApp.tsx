import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Joystick } from "./Joystick";
import { AxisHud } from "./AxisHud";
import { Scene } from "./Scene";
import {
  centerPoint,
  centroid,
  cloneObject,
  controls,
  DEFAULT_MATERIAL,
  makeObject,
  roundTo,
  sceneRefs,
  SNAP,
  STEPS,
  SWATCHES,
  type DragPlaneMode,
  type Material,
  type PlacedObject,
  type ShapeKind,
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

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: "box", label: "Box" },
  { kind: "sphere", label: "Sphere" },
  { kind: "cylinder", label: "Cyl" },
  { kind: "cone", label: "Cone" },
];

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "fly", label: "Fly" },
  { id: "orbit", label: "Orbit" },
  { id: "top", label: "Top" },
];

const TOOLS: { id: ToolMode; label: string }[] = [
  { id: "place", label: "Place" },
  { id: "edit", label: "Edit" },
  { id: "measure", label: "Measure" },
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

export function CadApp() {
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [view, setView] = useState<ViewMode>("fly");
  const [tool, setTool] = useState<ToolMode>("place");
  const [kind, setKind] = useState<ShapeKind>("box");
  const [size, setSize] = useState(1);
  const [step, setStep] = useState(1);
  const [rotStep, setRotStep] = useState(90);
  const [depth, setDepth] = useState(6);
  const [snap, setSnap] = useState(true);
  const [material, setMaterial] = useState<Material>(DEFAULT_MATERIAL);
  const [dragPlane, setDragPlane] = useState<DragPlaneMode>("horizontal");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [boxSelect, setBoxSelect] = useState(false);
  const [panel, setPanel] = useState<"none" | "style" | "scenes">("none");
  const [measureA, setMeasureA] = useState<[number, number, number] | null>(null);
  const [measureB, setMeasureB] = useState<[number, number, number] | null>(null);
  const [sceneName, setSceneName] = useState("");
  const [scenes, setScenes] = useState<string[]>([]);
  const [rect, setRect] = useState<null | {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }>(null);
  const rectActive = useRef(false);

  const grid = snap ? Math.max(step, 0.001) : SNAP;

  // Hydrate from auto-save
  useEffect(() => {
    const restored = loadAuto();
    if (restored?.length) setObjects(restored);
    setScenes(listScenes());
  }, []);

  useEffect(() => {
    autoSave(objects);
  }, [objects]);

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

  const place = () => {
    const p = centerPoint;
    setObjects((prev) => [
      ...prev,
      makeObject(kind, [p.x, p.y, p.z], size, material),
    ]);
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

  const nudge = (axis: 0 | 1 | 2, dir: 1 | -1) => {
    updateSelected((o) => {
      const position = [...o.position] as [number, number, number];
      position[axis] = +(position[axis] + dir * step).toFixed(6);
      return { ...o, position };
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
    updateSelected((o) => ({
      ...o,
      size: Math.max(0.001, +(o.size + dir * step).toFixed(6)),
    }));
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

  const ungroupSelected = () =>
    updateSelected((o) => ({ ...o, groupId: null }));

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
        return (
          p &&
          p.z < 1 &&
          p.x >= minX &&
          p.x <= maxX &&
          p.y >= minY &&
          p.y <= maxY
        );
      });
      setSelectedIds(hits.map((h) => h.id));
    }
    setRect(null);
    rectActive.current = false;
  };

  const selectionCenter = useMemo(
    () => centroid(selectedObjects),
    [selectedObjects],
  );

  const doSave = () => {
    const name = sceneName.trim() || `scene-${scenes.length + 1}`;
    saveScene(name, objects);
    setScenes(listScenes());
    setSceneName("");
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <h1 className="sr-only">Vector Bay — 3D CAD sketchpad</h1>

      <Canvas shadows camera={{ position: [0, 2.2, 9], fov: 62 }}>
        <Scene
          objects={objects}
          view={view}
          tool={tool}
          kind={kind}
          size={size}
          depth={depth}
          snap={snap}
          grid={grid}
          material={material}
          dragPlane={dragPlane}
          selectedIds={selectedIds}
          measureA={measureA}
          measureB={measureB}
          onSelect={handleSelect}
          onSelectNone={() => setSelectedIds([])}
          onMove={handleMove}
          onMeasurePick={onMeasurePick}
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
              }}
            >
              {t.label}
            </Chip>
          ))}
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
        <Btn onClick={() => setDepth((d) => Math.max(1, +(d - 1).toFixed(2)))}>
          D−
        </Btn>
        {view === "fly" && (
          <>
            <div className="my-1 h-px bg-grid-line" />
            <Btn
              onClick={() => {}}
              className="select-none"
            >
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
        {tool === "place" &&
          SHAPES.map((s) => (
            <Chip key={s.kind} active={kind === s.kind} onClick={() => setKind(s.kind)}>
              {s.label}
            </Chip>
          ))}

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
      </div>

      {/* Style panel */}
      {panel === "style" && (
        <div className="pointer-events-auto absolute bottom-56 left-1/2 z-40 w-[min(92vw,340px)] -translate-x-1/2 rounded-lg border border-grid-line bg-panel/95 p-3 shadow-hud backdrop-blur-md">
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
            <label
              key={key}
              className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
            >
              <span className="w-16">{key.slice(0, 5)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={material[key]}
                onChange={(e) => {
                  const next = { ...material, [key]: Number(e.target.value) };
                  setMaterial(next);
                  if (tool === "edit") applyMaterialToSelected(next);
                }}
                className="flex-1 accent-accent"
              />
              <span className="w-8 text-right text-foreground">
                {material[key].toFixed(2)}
              </span>
            </label>
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
                      setObjects(loaded);
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
        {/* size + step */}
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
                : setSize((v) => Math.max(0.001, +(v - step).toFixed(6)))
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
                : setSize((v) => +(v + step).toFixed(6))
            }
          >
            +
          </Btn>
        </div>

        {/* edit transform row */}
        {tool === "edit" && selectedIds.length > 0 && (
          <div className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-grid-line bg-panel/85 px-2 py-1.5 backdrop-blur-md">
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

// keep tree-shaking honest for helpers used only in dev builds
void roundTo;
