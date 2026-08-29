export function Crosshair() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <svg width="84" height="84" viewBox="0 0 84 84" className="text-crosshair">
        <line x1="42" y1="8" x2="42" y2="32" stroke="currentColor" strokeWidth="0.75" />
        <line x1="42" y1="52" x2="42" y2="76" stroke="currentColor" strokeWidth="0.75" />
        <line x1="8" y1="42" x2="32" y2="42" stroke="currentColor" strokeWidth="0.75" />
        <line x1="52" y1="42" x2="76" y2="42" stroke="currentColor" strokeWidth="0.75" />
        <circle cx="42" cy="42" r="10" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
        <circle cx="42" cy="42" r="1.4" fill="currentColor" />
      </svg>
    </div>
  );
}
