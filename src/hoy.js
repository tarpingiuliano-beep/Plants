/* Todo lo pendiente en un solo lugar (lógica pura): riegos, tareas y mediciones de crecimiento,
   y el aviso único de resumen de cada mañana. */
import { addDays, atTime, dateStr, daysBetween, nextDue } from './logic.js';

export const TRACK_EVERY = 30;

/** Seguimiento de crecimiento por defecto para una planta que todavía no lo tiene (se reparte para que no caigan todas juntas). */
export function defaultTrack(p, today = dateStr()) {
  const created = p.createdAt ? dateStr(new Date(p.createdAt)) : today;
  let next = addDays(created, TRACK_EVERY);
  if (daysBetween(today, next) < 0) next = addDays(today, 1 + ((p.nid || 0) % 14));
  return { every: TRACK_EVERY, next, on: true };
}

/** Devuelve las plantas con `track` completado (las que ya lo tienen no se tocan). */
export function ensureTracks(plants, today = dateStr()) {
  let changed = false;
  const out = plants.map((p) => {
    if (p.track) return p;
    changed = true;
    return { ...p, track: defaultTrack(p, today) };
  });
  return changed ? out : plants;
}

/** Todo lo que vence hasta `day` (inclusive): atrasado y del día. `late` = días de atraso respecto de `day`. */
export function itemsUpTo(plants, projects, day) {
  const items = [];
  for (const p of plants) {
    const due = nextDue(p);
    if (daysBetween(day, due) <= 0) items.push({ kind: 'water', holder: p, due, late: daysBetween(due, day) });
    if (p.track && p.track.on !== false && p.track.next && daysBetween(day, p.track.next) <= 0) {
      items.push({ kind: 'measure', holder: p, due: p.track.next, late: daysBetween(p.track.next, day) });
    }
  }
  for (const h of [...plants, ...projects.filter((j) => !j.done)]) {
    for (const t of h.tasks || []) {
      if (daysBetween(day, t.due) <= 0) items.push({ kind: 'task', holder: h, task: t, due: t.due, late: daysBetween(t.due, day) });
    }
  }
  return items.sort((a, b) => b.late - a.late || a.holder.name.localeCompare(b.holder.name));
}

export const pendingItems = (plants, projects, today = dateStr()) => {
  const all = itemsUpTo(plants, projects, today);
  return { late: all.filter((i) => i.late > 0), today: all.filter((i) => i.late === 0), all };
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function summaryParts(items) {
  const w = items.filter((i) => i.kind === 'water').length;
  const t = items.filter((i) => i.kind === 'task').length;
  const m = items.filter((i) => i.kind === 'measure').length;
  return [w && plural(w, 'riego', 'riegos'), t && plural(t, 'tarea', 'tareas'), m && plural(m, 'medida', 'medidas')].filter(Boolean);
}

const joinEs = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`);

/**
 * Un solo aviso por mañana, a la hora elegida, con el total de lo pendiente (lo atrasado se acumula).
 * Se vuelve a calcular cada vez que algo cambia, así que lo que ya hiciste no figura. Ids 800001+.
 */
export function buildDailySummary(plants, projects, settings, now = new Date(), horizon = 14) {
  const today = dateStr(now);
  const out = [];
  for (let k = 0; k <= horizon; k++) {
    const day = addDays(today, k);
    const at = atTime(day, settings.hour, settings.minute);
    if (at <= now) continue;
    const items = itemsUpTo(plants, projects, day);
    if (!items.length) continue;
    const late = items.filter((i) => i.late > 0).length;
    out.push({
      id: 800001 + k,
      plantId: '',
      title: `🌿 Hoy: ${joinEs(summaryParts(items))}`,
      body: late ? `${plural(late, 'cosa atrasada', 'cosas atrasadas')}. Entrá y mirá todo en un solo lugar.` : 'Entrá y mirá todo en un solo lugar.',
      at,
    });
  }
  return out;
}
