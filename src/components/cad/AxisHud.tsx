import { useSyncExternalStore } from "react";
import {
  getCenterSnapshot,
  subscribeCenter,
  tickUnitFor,
  type CenterSnapshot,
} from "./state";

const PPU = 72; // pixels per world unit along the rulers
const Z_STRIP_OFFSET = 74; // px below the horizontal axis

function useCenter(): CenterSnapshot {
  return useSyncExternalStore(
    subscribeCenter,
    getCenterSnapshot,
    getCenterSnapshot,
  );
}

function format(value: number, unit: number) {
  const decimals = unit >= 1 ? 0 : unit >= 0.1 ? 1 : unit >= 0.01 ? 2 : 3;
  const v = Math.abs(value) < unit / 1000 ? 0 : value;
  return v.toFixed(decimals);
}

function ticks(center: number, unit: number, halfSpan: number) {
  const first = Math.ceil((center - halfSpan) / unit) * unit;
  const out: number[] = [];
  for (let v = first; v <= center + halfSpan; v += unit) {
    out.push(Math.round(v / unit) * unit);
  }
  return out;
}

/**
 * Screen-locked quadrant axes. The lines never move — they always cross at the
 * exact center of the viewport, which is also the placement point. The numbers
 * slide underneath them as you fly, like a ruler scrolling under a needle.
 */
export function AxisHud({ step }: { step: number }) {
  const c = useCenter();
  const unit = tickUnitFor(step);
  const halfSpanX = 1000 / PPU;
  const halfSpanY = 700 / PPU;

  const xTicks = ticks(c.x, unit, halfSpanX);
  const yTicks = ticks(c.y, unit, halfSpanY);
  const zTicks = ticks(c.z, unit, halfSpanX);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <svg className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="ax-fade-x" x1="0" x2="1">
            <stop offset="0%" stopOpacity="0" stopColor="currentColor" />
            <stop offset="18%" stopOpacity="0.9" stopColor="currentColor" />
            <stop offset="82%" stopOpacity="0.9" stopColor="currentColor" />
            <stop offset="100%" stopOpacity="0" stopColor="currentColor" />
          </linearGradient>
          <linearGradient id="ax-fade-y" y1="0" y2="1" x1="0" x2="0">
            <stop offset="0%" stopOpacity="0" stopColor="currentColor" />
            <stop offset="18%" stopOpacity="0.9" stopColor="currentColor" />
            <stop offset="82%" stopOpacity="0.9" stopColor="currentColor" />
            <stop offset="100%" stopOpacity="0" stopColor="currentColor" />
          </linearGradient>
        </defs>

        {/* Horizontal axis = X */}
        <g className="text-axis-x">
          <line
            x1="0"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="url(#ax-fade-x)"
            strokeWidth="1"
          />
          {xTicks.map((v) => {
            const dx = (v - c.x) * PPU;
            const major = Math.abs(Math.round(v / unit) % 5) === 0;
            return (
              <g key={`x${v}`} transform={`translate(${dx}, 0)`}>
                <rect
                  x="50%"
                  y="50%"
                  width="1"
                  height={major ? 9 : 5}
                  transform={`translate(0, ${major ? -9 : -5})`}
                  fill="currentColor"
                  fillOpacity="0.75"
                />
                {major && (
                  <text
                    x="50%"
                    y="50%"
                    dy="18"
                    textAnchor="middle"
                    className="fill-current font-mono"
                    fontSize="10"
                    fillOpacity="0.9"
                  >
                    {format(v, unit)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Vertical axis = Y */}
        <g className="text-axis-y">
          <line
            x1="50%"
            y1="0"
            x2="50%"
            y2="100%"
            stroke="url(#ax-fade-y)"
            strokeWidth="1"
          />
          {yTicks.map((v) => {
            const dy = -(v - c.y) * PPU;
            const major = Math.abs(Math.round(v / unit) % 5) === 0;
            return (
              <g key={`y${v}`} transform={`translate(0, ${dy})`}>
                <rect
                  x="50%"
                  y="50%"
                  width={major ? 9 : 5}
                  height="1"
                  transform={`translate(${major ? -9 : -5}, 0)`}
                  fill="currentColor"
                  fillOpacity="0.75"
                />
                {major && (
                  <text
                    x="50%"
                    y="50%"
                    dx="-14"
                    dy="3"
                    textAnchor="end"
                    className="fill-current font-mono"
                    fontSize="10"
                    fillOpacity="0.9"
                  >
                    {format(v, unit)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Depth strip = Z (into the screen), rendered as its own ruler */}
        <g className="text-axis-z" transform={`translate(0, ${Z_STRIP_OFFSET})`}>
          <line
            x1="0"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="url(#ax-fade-x)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          {zTicks.map((v) => {
            const dx = (v - c.z) * PPU;
            const major = Math.abs(Math.round(v / unit) % 5) === 0;
            return (
              <g key={`z${v}`} transform={`translate(${dx}, 0)`}>
                <rect
                  x="50%"
                  y="50%"
                  width="1"
                  height={major ? 8 : 4}
                  fill="currentColor"
                  fillOpacity="0.7"
                />
                {major && (
                  <text
                    x="50%"
                    y="50%"
                    dy="21"
                    textAnchor="middle"
                    className="fill-current font-mono"
                    fontSize="10"
                    fillOpacity="0.85"
                  >
                    {format(v, unit)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Center reticle + live readout */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className={`h-2.5 w-2.5 rounded-full border ${
            c.onSurface
              ? "border-accent bg-accent/50 shadow-glow"
              : "border-crosshair bg-crosshair/25"
          }`}
        />
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-12 whitespace-nowrap rounded-md border border-grid-line bg-panel/85 px-2 py-1 font-mono text-[10px] tracking-wider backdrop-blur-sm">
        <span className="text-axis-x">X {c.x.toFixed(3)}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="text-axis-y">Y {c.y.toFixed(3)}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="text-axis-z">Z {c.z.toFixed(3)}</span>
        {c.onSurface && <span className="ml-2 text-accent">FACE</span>}
      </div>
    </div>
  );
}
