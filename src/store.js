const KEY = 'plantas.v1';

const DEFAULTS = { plants: [], settings: { hour: 9, minute: 0 }, nextNid: 1 };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return {
      plants: Array.isArray(data.plants) ? data.plants : [],
      settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
      nextNid: data.nextNid || 1,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** Devuelve true si se guardó bien (puede fallar por falta de espacio) */
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
