import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Props = {
  label: string;
  onChange: (x: number, y: number) => void;
};

const SIZE = 116;
const RADIUS = SIZE / 2;
const KNOB = 46;

export function Joystick({ label, onChange }: Props) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const max = RADIUS - KNOB / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx / max, dy / max);
  };

  const end = () => {
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  };

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <div
        ref={baseRef}
        style={{ width: SIZE, height: SIZE, touchAction: "none" }}
        className="relative rounded-full border border-grid-line bg-panel/80 shadow-hud backdrop-blur-md"
        onPointerDown={(e: ReactPointerEvent) => {
          activeId.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e: ReactPointerEvent) => {
          if (activeId.current !== e.pointerId) return;
          update(e.clientX, e.clientY);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div className="absolute inset-3 rounded-full border border-dashed border-grid-line/70" />
        <div
          style={{
            width: KNOB,
            height: KNOB,
            transform: `translate(-50%, -50%) translate(${knob.x}px, ${knob.y}px)`,
          }}
          className="absolute left-1/2 top-1/2 rounded-full border border-accent/60 bg-accent/20 shadow-glow"
        />
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
