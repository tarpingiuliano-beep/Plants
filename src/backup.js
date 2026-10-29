/* Respaldo y restauración (lógica pura, sin tocar el celular). */

export const BACKUP_APP = 'plantas';
export const BACKUP_VERSION = 1;
export const BACKUP_REMINDER_DAYS = 14;

/** Arma el archivo de respaldo. No incluye claves de API ni el clima en caché. */
export function buildBackup(data, now = new Date()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      plants: data.plants || [],
      projects: data.projects || [],
      species: data.species || {},
      settings: data.settings || {},
      place: data.place || null,
      nextNid: data.nextNid || 1,
    },
  };
}

export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `plantas-respaldo-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** Lee y valida el texto de un respaldo. Devuelve { ok, backup } o { ok:false, error }. */
export function parseBackup(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no se puede leer. ¿Es un respaldo de Plantas?' };
  }
  if (!j || j.app !== BACKUP_APP || !j.data) return { ok: false, error: 'Este archivo no es un respaldo de Plantas.' };
  if (typeof j.version !== 'number' || j.version > BACKUP_VERSION) {
    return { ok: false, error: 'Este respaldo es de una versión más nueva de la app. Actualizá Plantas e intentá de nuevo.' };
  }
  const d = j.data;
  if (!Array.isArray(d.plants)) return { ok: false, error: 'El respaldo está incompleto (faltan las plantas).' };
  const plants = d.plants.filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && p.id);
  return {
    ok: true,
    backup: {
      exportedAt: j.exportedAt || null,
      data: {
        plants,
        projects: (Array.isArray(d.projects) ? d.projects : []).filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && p.id && p.plan && Array.isArray(p.plan.etapas)),
        species: d.species && typeof d.species === 'object' ? d.species : {},
        settings: d.settings && typeof d.settings === 'object' ? d.settings : {},
        place: d.place && typeof d.place === 'object' ? d.place : null,
        nextNid: Number.isInteger(d.nextNid) && d.nextNid > 0 ? d.nextNid : 1,
      },
    },
  };
}

export function summarize(d) {
  const photos = (d.plants || []).reduce((n, p) => n + (p.photo ? 1 : 0), 0);
  return { plants: (d.plants || []).length, projects: (d.projects || []).length, species: Object.keys(d.species || {}).length, photos };
}

/** Reemplaza todo lo guardado por el respaldo; conserva las claves y el clima de este celular. */
export function replaceWith(current, incoming) {
  const maxNid = Math.max(0, ...incoming.plants.map((p) => p.nid || 0));
  return {
    ...current,
    plants: incoming.plants,
    projects: incoming.projects || [],
    species: incoming.species,
    settings: { ...current.settings, ...incoming.settings },
    place: incoming.place || current.place,
    nextNid: Math.max(incoming.nextNid, maxNid + 1),
    climate: incoming.place ? null : current.climate,
  };
}

/** Suma lo del respaldo a lo que ya hay. Las plantas con id repetido se saltean; las nuevas reciben nid propio. */
export function mergeWith(current, incoming) {
  const have = new Set(current.plants.map((p) => p.id));
  let nid = Math.max(current.nextNid || 1, ...current.plants.map((p) => (p.nid || 0) + 1));
  const added = [];
  for (const p of incoming.plants) {
    if (have.has(p.id)) continue;
    added.push({ ...p, nid: nid++ });
  }
  const species = { ...incoming.species, ...current.species };
  const haveJ = new Set((current.projects || []).map((p) => p.id));
  const newJ = (incoming.projects || []).filter((p) => !haveJ.has(p.id));
  return {
    data: { ...current, plants: [...current.plants, ...added], projects: [...(current.projects || []), ...newJ], species, nextNid: nid, place: current.place || incoming.place },
    added: added.length,
    addedProjects: newJ.length,
    skipped: incoming.plants.length - added.length,
  };
}

/** Días desde el último respaldo (null si nunca). */
export function daysSinceBackup(lastBackup, now = new Date()) {
  if (!lastBackup) return null;
  const t = Date.parse(lastBackup);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

export const needsBackupReminder = (plantCount, lastBackup, now = new Date()) => {
  if (!plantCount) return false;
  const d = daysSinceBackup(lastBackup, now);
  return d === null || d >= BACKUP_REMINDER_DAYS;
};

export function lastBackupText(lastBackup, now = new Date()) {
  const d = daysSinceBackup(lastBackup, now);
  if (d === null) return 'Todavía no hiciste ningún respaldo.';
  if (d === 0) return 'Último respaldo: hoy.';
  if (d === 1) return 'Último respaldo: ayer.';
  return `Último respaldo: hace ${d} días.`;
}
