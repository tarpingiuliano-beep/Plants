const KEY = 'plantas.v1';

const defaults = () => ({
  plants: [],
  settings: { hour: 9, minute: 0 },
  nextNid: 1,
  place: null, // { name, lat, lon }
  climate: null, // resumen del pronóstico (ver summarizeClimate)
  keys: { plantnet: '' }, // se guarda solo en el celular, nunca en el repo
  species: {}, // base offline: { [nombre científico]: { sci, names, care, wiki, wikiTried, addedAt } }
});

export function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw);
    return {
      ...base,
      ...d,
      plants: Array.isArray(d.plants) ? d.plants : [],
      settings: { ...base.settings, ...(d.settings || {}) },
      keys: { ...base.keys, ...(d.keys || {}) },
      species: d.species && typeof d.species === 'object' ? d.species : {},
      nextNid: d.nextNid || 1,
    };
  } catch {
    return base;
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
