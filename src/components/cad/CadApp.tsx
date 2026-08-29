import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useState } from "react";
import * as THREE from "three";
import { Scene } from "./Scene";
import { Crosshair } from "./Crosshair";
import { Joystick } from "./Joystick";
import { controls, crosshair, snapVec, type PlacedObject, type ShapeKind } from "./state";

const KINDS: { id: ShapeKind; label: string }[] = [
  { id: "box", label: "Box" },
  { id: "sphere", label: "Sphere" },
  { id: "cylinder", label: "Cyl" },
  { id: "cone", label: "Cone" },
];

export function CadApp() {
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [kind, setKind] = useState<ShapeKind>("box");
  const [size, setSize] = useState(1);
  const [depth, setDepth] = useState(6);
  const [snap, setSnap] = useState(true);
  const [readout, setReadout] = useState(new THREE.Vector3());
  const [lastId, setLastId] = useState<string | null>(null);

  const onReadout = useCallback((v: THREE.Vector3) => setReadout(v), []);

  const addObject = () => {
    const id = crypto.randomUUID();
    setObjects((prev) => [
      ...prev,
      { id, kind, size, position: snapVec(crosshair, snap) },
    ]);
    setLastId(id);
  };

  const undo = () => {
    setObjects((prev) => prev.slice(0, -1));
    setLastId(null);
  };

  const fmt = (n: number) => (snap ? (Math.round(n / 0.5) * 0.5).toFixed(2) : n.toFixed(2));

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <Canvas shadows camera={{ fov: 62, near: 0.1, far: 400 }}>
        <Suspense fallback={null}>
          <Scene
            objects={objects}
            depth={depth}
            kind={kind}
            size={size}
            selectedId={lastId}
            onReadout={onReadout}
          />
        </Suspense>
      </Canvas>

      <Crosshair />

      {/* top telemetry */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-grid-line bg-panel/85 px-3 py-2 font-mono text-xs shadow-hud backdrop-blur-md">
          <span className="text-axis-x">X {fmt(readout.x)}</span>
          <span className="text-axis-y">Y {fmt(readout.y)}</span>
          <span className="text-axis-z">Z {fmt(readout.z)}</span>
          <span className="text-muted-foreground">| {objects.length} obj</span>
        </div>
      </div>

      {/* right tool rail */}
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-lg border px-2.5 py-2 font-mono text-[10px] uppercase tracking-wider shadow-hud backdrop-blur-md transition-colors ${
              kind === k.id
                ? "border-accent bg-accent/25 text-accent"
                : "border-grid-line bg-panel/80 text-muted-foreground"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* left rail: crosshair depth + elevation */}
      <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2">
        <RailButton onClick={() => setDepth((d) => Math.min(30, d + 1))}>D+</RailButton>
        <span className="font-mono text-[10px] text-muted-foreground">{depth.toFixed(0)}m</span>
        <RailButton onClick={() => setDepth((d) => Math.max(1, d - 1))}>D−</RailButton>
        <div className="h-2" />
        <HoldButton onHold={(v) => (controls.lift = v)} value={1}>
          ↑
        </HoldButton>
        <HoldButton onHold={(v) => (controls.lift = v)} value={-1}>
          ↓
        </HoldButton>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 p-3">
        <div className="mb-3 flex items-center justify-center gap-2">
          <button
            onClick={addObject}
            className="rounded-full border border-accent bg-accent/25 px-7 py-3 font-mono text-sm uppercase tracking-[0.2em] text-accent shadow-glow backdrop-blur-md active:bg-accent/40"
          >
            Add
          </button>
          <button
            onClick={undo}
            className="rounded-full border border-grid-line bg-panel/80 px-4 py-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground shadow-hud backdrop-blur-md"
          >
            Undo
          </button>
          <button
            onClick={() => setSnap((s) => !s)}
            className={`rounded-full border px-4 py-3 font-mono text-[11px] uppercase tracking-wider shadow-hud backdrop-blur-md ${
              snap ? "border-accent bg-accent/20 text-accent" : "border-grid-line bg-panel/80 text-muted-foreground"
            }`}
          >
            Snap
          </button>
          <button
            onClick={() => setSize((s) => (s >= 4 ? 0.5 : s + 0.5))}
            className="rounded-full border border-grid-line bg-panel/80 px-4 py-3 font-mono text-[11px] text-muted-foreground shadow-hud backdrop-blur-md"
          >
            {size.toFixed(1)}
          </button>
        </div>

        <div className="flex items-end justify-between">
          <Joystick
            label="Move"
            onChange={(x, y) => {
              controls.move.x = x;
              controls.move.y = y;
            }}
          />
          <Joystick
            label="Pivot"
            onChange={(x, y) => {
              controls.look.x = x;
              controls.look.y = y;
            }}
          />
        </div>
      </div>
    </div>
  );
}

function RailButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-grid-line bg-panel/80 px-2.5 py-2 font-mono text-[11px] text-muted-foreground shadow-hud backdrop-blur-md"
    >
      {children}
    </button>
  );
}

function HoldButton({
  children,
  onHold,
  value,
}: {
  children: React.ReactNode;
  onHold: (v: number) => void;
  value: number;
}) {
  return (
    <button
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onHold(value);
      }}
      onPointerUp={() => onHold(0)}
      onPointerCancel={() => onHold(0)}
      onPointerLeave={() => onHold(0)}
      className="rounded-lg border border-grid-line bg-panel/80 px-2.5 py-2 font-mono text-sm text-accent shadow-hud backdrop-blur-md active:bg-accent/25"
    >
      {children}
    </button>
  );
}
