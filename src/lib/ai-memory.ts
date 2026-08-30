const PREFS_KEY = "vectorbay:ai:prefs";
const EX_KEY = "vectorbay:ai:examples";

export type BuilderPrefs = {
  defaultSize: number;
  defaultColor: string;
  units: string;
  notes: string;
};

export const DEFAULT_PREFS: BuilderPrefs = {
  defaultSize: 1,
  defaultColor: "#8fa7bd",
  units: "metres",
  notes: "",
};

export type BuildExample = {
  prompt: string;
  summary: string;
  accepted: boolean;
  correction?: string;
  at: number;
  stepCount: number;
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadPrefs(): BuilderPrefs {
  return safe(() => {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as BuilderPrefs) } : DEFAULT_PREFS;
  }, DEFAULT_PREFS);
}

export function savePrefs(p: BuilderPrefs) {
  safe(() => localStorage.setItem(PREFS_KEY, JSON.stringify(p)), null);
}

export function loadExamples(): BuildExample[] {
  return safe(() => {
    const raw = localStorage.getItem(EX_KEY);
    return raw ? (JSON.parse(raw) as BuildExample[]) : [];
  }, []);
}

export function recordExample(ex: BuildExample) {
  safe(() => {
    const all = [ex, ...loadExamples()].slice(0, 40);
    localStorage.setItem(EX_KEY, JSON.stringify(all));
    return all;
  }, []);
}

export function clearExamples() {
  safe(() => localStorage.removeItem(EX_KEY), null);
}

/** Compact preference text sent to the model. */
export function prefsPrompt(p: BuilderPrefs) {
  return [
    `Default part size: ${p.defaultSize} ${p.units}.`,
    `Default colour: ${p.defaultColor}.`,
    p.notes ? `Style notes: ${p.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The most relevant past builds, as few-shot context. */
export function examplesPrompt(prompt: string, limit = 6) {
  const words = prompt.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = loadExamples().map((e) => {
    const hay = `${e.prompt} ${e.summary}`.toLowerCase();
    const score = words.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
    return { e, score };
  });
  return scored
    .sort((a, b) => b.score - a.score || b.e.at - a.e.at)
    .slice(0, limit)
    .map(
      ({ e }) =>
        `- "${e.prompt}" -> ${e.summary} (${e.stepCount} steps) — ${
          e.accepted ? "ACCEPTED, build like this" : `REJECTED${e.correction ? `: ${e.correction}` : ""}`
        }`,
    )
    .join("\n");
}
