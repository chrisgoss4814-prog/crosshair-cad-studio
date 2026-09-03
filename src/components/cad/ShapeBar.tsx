import { SHAPES_2D, SHAPES_3D, type ShapeKind } from "./geometry";

/** Simple outline glyphs, drawn in a 24×24 box. */
function Glyph({ kind }: { kind: ShapeKind }) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  const poly = (n: number, r = 9, cx = 12, cy = 12, rot = -Math.PI / 2) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i / n) * Math.PI * 2;
      return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
    }).join(" ");

  const body = (() => {
    switch (kind) {
      case "box":
        return (
          <>
            <path d="M4 8l8-4 8 4v8l-8 4-8-4z" {...p} />
            <path d="M4 8l8 4 8-4M12 12v8" {...p} />
          </>
        );
      case "sphere":
        return (
          <>
            <circle cx="12" cy="12" r="8.5" {...p} />
            <ellipse cx="12" cy="12" rx="8.5" ry="3.4" {...p} />
          </>
        );
      case "cylinder":
        return (
          <>
            <ellipse cx="12" cy="6" rx="7" ry="2.8" {...p} />
            <path d="M5 6v12M19 6v12" {...p} />
            <ellipse cx="12" cy="18" rx="7" ry="2.8" {...p} />
          </>
        );
      case "cone":
        return (
          <>
            <path d="M12 3l7 15M12 3L5 18" {...p} />
            <ellipse cx="12" cy="18" rx="7" ry="2.8" {...p} />
          </>
        );
      case "pyramid":
        return (
          <>
            <path d="M12 3l8 15H4z" {...p} />
            <path d="M12 3v15M4 18l8-4 8 4" {...p} />
          </>
        );
      case "wedge":
        return <path d="M4 19V8l14 11z" {...p} />;
      case "torus":
        return (
          <>
            <ellipse cx="12" cy="12" rx="9" ry="5.5" {...p} />
            <ellipse cx="12" cy="12" rx="3.5" ry="1.8" {...p} />
          </>
        );
      case "capsule":
        return <rect x="7" y="3" width="10" height="18" rx="5" {...p} />;
      case "tube":
        return (
          <>
            <ellipse cx="12" cy="6" rx="7" ry="2.8" {...p} />
            <ellipse cx="12" cy="6" rx="3.4" ry="1.3" {...p} />
            <path d="M5 6v12M19 6v12" {...p} />
            <path d="M5 18a7 2.8 0 0014 0" {...p} />
          </>
        );
      case "tetra":
        return (
          <>
            <path d="M12 3L21 19H3z" {...p} />
            <path d="M12 3v10M12 13L3 19M12 13l9 6" {...p} />
          </>
        );
      case "octa":
        return (
          <>
            <path d="M12 2l8 10-8 10-8-10z" {...p} />
            <path d="M4 12h16" {...p} />
          </>
        );
      case "icosa":
        return (
          <>
            <polygon points={poly(6, 9.5)} {...p} />
            <path d="M12 2.5v19M4 7l16 10M20 7L4 17" {...p} />
          </>
        );
      case "dodeca":
        return (
          <>
            <polygon points={poly(5, 9.5)} {...p} />
            <polygon points={poly(5, 4.4, 12, 12, Math.PI / 2)} {...p} />
          </>
        );
      case "rect":
        return <rect x="3.5" y="6" width="17" height="12" rx="1" {...p} />;
      case "circle":
        return <circle cx="12" cy="12" r="8.5" {...p} />;
      case "ellipse":
        return <ellipse cx="12" cy="12" rx="9" ry="5.5" {...p} />;
      case "triangle":
        return <path d="M12 3.5L20.5 19h-17z" {...p} />;
      case "polygon":
        return <polygon points={poly(6)} {...p} />;
      case "star":
        return (
          <polygon
            points={Array.from({ length: 10 }, (_, i) => {
              const r = i % 2 === 0 ? 9.5 : 4.2;
              const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
              return `${(12 + Math.cos(a) * r).toFixed(2)},${(12 + Math.sin(a) * r).toFixed(2)}`;
            }).join(" ")}
            {...p}
          />
        );
      case "slot":
        return <rect x="2.5" y="8" width="19" height="8" rx="4" {...p} />;
      case "arc":
        return <path d="M3 17a9 9 0 0118 0h-4.5a4.5 4.5 0 00-9 0z" {...p} />;
      default:
        return <rect x="4" y="4" width="16" height="16" rx="1" {...p} />;
    }
  })();

  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      {body}
    </svg>
  );
}

/** Vertical icon rail pinned to one screen edge. */
function Rail({
  title,
  list,
  active,
  onPick,
  side,
}: {
  title: string;
  list: readonly ShapeKind[];
  active: ShapeKind;
  onPick: (k: ShapeKind) => void;
  side: "left" | "right";
}) {
  return (
    <div
      className={`pointer-events-auto absolute top-1/2 z-40 flex max-h-[52vh] w-11 -translate-y-1/2 flex-col items-center gap-1 rounded-lg border border-grid-line bg-panel/70 py-1 backdrop-blur-md ${
        side === "left" ? "left-1" : "right-1"
      }`}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </span>
      <div className="flex flex-col gap-1 overflow-y-auto overscroll-contain px-1 pb-0.5">
        {list.map((k) => (
          <button
            key={k}
            type="button"
            title={k}
            aria-label={k}
            onClick={() => onPick(k)}
            className={`flex shrink-0 flex-col items-center rounded-md border p-1 transition-colors ${
              active === k
                ? "border-accent bg-accent/20 text-accent shadow-glow"
                : "border-grid-line bg-panel/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Glyph kind={k} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Shape picker: 3D icons on the left edge, 2D icons on the right edge. */
export function ShapeBar({
  kind,
  onPick,
}: {
  kind: ShapeKind;
  onPick: (k: ShapeKind) => void;
}) {
  return (
    <>
      <Rail title="3d" list={SHAPES_3D} active={kind} onPick={onPick} side="left" />
      <Rail title="2d" list={SHAPES_2D} active={kind} onPick={onPick} side="right" />
    </>
  );
}
