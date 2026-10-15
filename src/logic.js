// Lógica pura (sin DOM ni plugins) para poder testearla con node.

const pad = (n) => String(n).padStart(2, '0');

/** Fecha local en formato YYYY-MM-DD */
export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Convierte YYYY-MM-DD a Date local a las 00:00 */
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

/** Días de diferencia (b - a), en días calendario */
export function daysBetween(a, b) {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86400000);
}

export function nextDue(plant) {
  return addDays(plant.lastWatered, plant.everyDays);
}

/**
 * Estado de riego de una planta.
 * days: días hasta el riego (negativo = atrasada)
 */
export function waterStatus(plant, today = dateStr()) {
  const days = daysBetween(today, nextDue(plant));
  let state = 'ok';
  if (days < 0) state = 'overdue';
  else if (days === 0) state = 'today';
  else if (days <= 2) state = 'soon';
  return { days, state };
}

export function statusText({ days, state }) {
  if (state === 'overdue') {
    return days === -1 ? 'Atrasada 1 día' : `Atrasada ${-days} días`;
  }
  if (state === 'today') return 'Regar hoy';
  if (days === 1) return 'Regar mañana';
  return `Regar en ${days} días`;
}

/** Ordena: las más urgentes primero */
export function sortPlants(plants, today = dateStr()) {
  return [...plants].sort(
    (a, b) => waterStatus(a, today).days - waterStatus(b, today).days || a.name.localeCompare(b.name),
  );
}

function atTime(day, hour, minute) {
  const d = parseDate(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export const FOLLOW_UPS = 3;

/**
 * Arma la lista de notificaciones a programar.
 * Por planta: una el día que toca regar y hasta 3 recordatorios más si se pasa.
 * Si la planta ya está atrasada, los recordatorios arrancan hoy (o mañana si ya pasó la hora).
 */
export function buildSchedule(plants, settings, now = new Date()) {
  const today = dateStr(now);
  const out = [];
  for (const p of plants) {
    const due = nextDue(p);
    const start = daysBetween(today, due) >= 0 ? due : today;
    for (let k = 0; k <= FOLLOW_UPS; k++) {
      const day = addDays(start, k);
      const at = atTime(day, settings.hour, settings.minute);
      if (at <= now) continue;
      const late = daysBetween(due, day);
      let title;
      let body;
      if (late === 0) {
        title = `Hoy toca regar: ${p.name}`;
        body = p.location ? `Está en: ${p.location}` : 'Tu planta te necesita 🌱';
      } else {
        title = `${p.name} está esperando agua`;
        body = late === 1 ? 'Se pasó el riego de ayer.' : `Hace ${late} días que debía regarse.`;
      }
      out.push({ id: p.nid * 10 + k, plantId: p.id, title, body, at });
    }
  }
  return out;
}

export function newPlant({ nid, name, species, location, photo, everyDays, lastWatered }, now = new Date()) {
  return {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nid,
    name: name.trim(),
    species: (species || '').trim(),
    location: (location || '').trim(),
    photo: photo || '',
    everyDays: Math.max(1, Math.min(365, Number(everyDays) || 7)),
    lastWatered: lastWatered || dateStr(now),
    createdAt: now.toISOString(),
    history: [],
  };
}

/** Registra un riego (devuelve una planta nueva, no muta) */
export function waterPlant(plant, when = new Date(), note = '') {
  return {
    ...plant,
    lastWatered: dateStr(when),
    history: [{ at: when.toISOString(), type: 'riego', note }, ...plant.history].slice(0, 200),
  };
}

export function addNote(plant, note, when = new Date()) {
  return {
    ...plant,
    history: [{ at: when.toISOString(), type: 'nota', note }, ...plant.history].slice(0, 200),
  };
}
