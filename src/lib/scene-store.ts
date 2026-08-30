import { hydrateObject, type PlacedObject } from "@/components/cad/state";

const PREFIX = "vectorbay:scene:";
const AUTO = "vectorbay:auto";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function listScenes(): string[] {
  return safe(() => {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) out.push(key.slice(PREFIX.length));
    }
    return out.sort();
  }, []);
}

export function saveScene(name: string, objects: PlacedObject[]) {
  safe(() => localStorage.setItem(PREFIX + name, JSON.stringify(objects)), null);
}

export function loadScene(name: string): PlacedObject[] | null {
  return safe(() => {
    const raw = localStorage.getItem(PREFIX + name);
    return raw ? (JSON.parse(raw) as PlacedObject[]) : null;
  }, null);
}

export function deleteScene(name: string) {
  safe(() => localStorage.removeItem(PREFIX + name), null);
}

export function autoSave(objects: PlacedObject[]) {
  safe(() => localStorage.setItem(AUTO, JSON.stringify(objects)), null);
}

export function loadAuto(): PlacedObject[] | null {
  return safe(() => {
    const raw = localStorage.getItem(AUTO);
    if (!raw) return null;
    return (JSON.parse(raw) as PlacedObject[]).map((o) => hydrateObject(o));
  }, null);
}
