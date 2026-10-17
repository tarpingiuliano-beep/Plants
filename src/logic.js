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
  // Plantas en modo automático: fecha calculada día por día con el pronóstico (válida solo para este último riego)
  if (plant.auto && plant.projDue && plant.projFor === plant.lastWatered) return plant.projDue;
  return addDays(plant.lastWatered, plant.everyDays);
}

/**
 * Cuándo toca regar, simulando día por día: cada día "gasta" una fracción de agua que depende de la temperatura
 * de ese día (pronóstico); la lluvia fuerte cuenta como riego en plantas de afuera. Más allá del pronóstico se
 * usa la temperatura media. Con clima constante da lo mismo que adjustedDays.
 */
export function projectDue(plant, placement, climate) {
  const fallback = addDays(plant.lastWatered, plant.everyDays);
  if (!plant.baseDays || !climate?.days) return fallback;
  const byDate = new Map(climate.days.map((d) => [d.date, d]));
  const dry = placement.dry ?? 1;
  let thirst = 0;
  for (let k = 1; k <= 60; k++) {
    const day = addDays(plant.lastWatered, k);
    const d = byDate.get(day);
    const t = d ? (d.max + d.min) / 2 : climate.avgTemp;
    const tf = Number.isFinite(t) ? tempFactor(t) : 1;
    const f = placement.outdoor ? tf : 1 + (tf - 1) * 0.5;
    if (placement.rain && d) {
      if (d.rain >= 8) {
        thirst = 0; // llovió bien: es como si la hubieran regado
        continue;
      }
      if (d.rain >= 3) thirst = Math.max(0, thirst - 0.5);
    }
    const c = 1 / Math.max(1, plant.baseDays * f * dry);
    thirst += c;
    if (thirst >= 1 - c / 2) return day;
  }
  return addDays(plant.lastWatered, 60);
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

export function atTime(day, hour, minute) {
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

export function newPlant(
  { nid, name, species, location, photo, everyDays, lastWatered, sci, genus, family, placement, auto, baseDays },
  now = new Date(),
) {
  return {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nid,
    name: name.trim(),
    species: (species || '').trim(),
    location: (location || '').trim(),
    photo: photo || '',
    sci: sci || '',
    genus: genus || '',
    family: family || '',
    placement: placement || 'interior-luz',
    auto: !!auto,
    baseDays: Number(baseDays) || 0,
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

/* ---------- Clima y ubicación ---------- */

/** Cuánto se alarga (>1) o acorta (<1) el intervalo según la temperatura media. */
export function tempFactor(t) {
  if (t <= 8) return 1.9;
  if (t <= 14) return 1.5;
  if (t <= 19) return 1.15;
  if (t <= 25) return 1;
  if (t <= 30) return 0.8;
  return 0.65;
}

/**
 * Días entre riegos para una planta, a partir del valor base de su especie,
 * el lugar donde está y la temperatura media pronosticada.
 * Adentro el clima pega la mitad que afuera.
 */
export function adjustedDays(baseDays, placement, avgTemp) {
  let f = 1;
  if (Number.isFinite(avgTemp)) {
    const tf = tempFactor(avgTemp);
    f = placement.outdoor ? tf : 1 + (tf - 1) * 0.5;
  }
  return Math.max(1, Math.min(60, Math.round(baseDays * f * (placement.dry ?? 1))));
}

/** Resume el pronóstico diario [{date,max,min,rain}] en lo que usa la app. */
export function summarizeClimate(days, now = Date.now()) {
  const valid = days.filter((d) => Number.isFinite(d.max) && Number.isFinite(d.min));
  if (!valid.length) return null;
  const week = valid.slice(0, 7);
  const avgTemp = week.reduce((a, d) => a + (d.max + d.min) / 2, 0) / week.length;
  const next3 = valid.slice(0, 3);
  const coldest = next3.reduce((m, d) => (d.min < m.min ? d : m), next3[0]);
  return {
    fetchedAt: now,
    avgTemp: Math.round(avgTemp * 10) / 10,
    minNext3: coldest.min,
    minDate: coldest.date,
    rainToday: valid[0].rain || 0,
    rainTomorrow: valid[1]?.rain || 0,
    days: valid.map((d) => ({ date: d.date, max: d.max, min: d.min, rain: d.rain || 0 })),
  };
}

/** Plantas de afuera que no aguantan la mínima de ese día. */
export function plantsAtColdRisk(plants, minTemp, getCare, placementLookup) {
  return plants.filter((p) => {
    if (!placementLookup(p.placement).outdoor) return false;
    const care = getCare(p);
    return care && minTemp < care.minTemp;
  });
}

export const COLD_ALERT_FROM = 4; // °C: desde acá avisamos

/** Notificaciones de "noche fría" a las 19:00 para los próximos 3 días. */
export function buildColdAlerts(plants, climate, getCare, placementLookup, now = new Date()) {
  if (!climate?.days) return [];
  const out = [];
  climate.days.slice(0, 7).forEach((d, i) => {
    if (d.min > COLD_ALERT_FROM) return;
    const risk = plantsAtColdRisk(plants, d.min, getCare, placementLookup);
    if (!risk.length) return;
    const at = atTime(d.date, 19, 0);
    if (at <= now) return;
    out.push({
      id: 900001 + i,
      plantId: risk[0].id,
      title: d.min <= 0 ? '❄️ Helada esta noche' : '🥶 Noche fría',
      body: `Mínima de ${Math.round(d.min)} °C. Entrá o cubrí: ${risk.map((p) => p.name).join(', ')}`,
      at,
    });
  });
  return out;
}

export const HEAT_ALERT_FROM = 35; // °C de máxima: valor por defecto si no sabemos qué aguanta la especie

/** Plantas de afuera a las que les puede hacer mal una máxima de `max` grados. */
export function plantsAtHeatRisk(plants, max, getCare, placementLookup) {
  return plants.filter((p) => {
    if (!placementLookup(p.placement).outdoor) return false;
    const limit = getCare(p)?.maxTemp ?? HEAT_ALERT_FROM;
    return max >= limit;
  });
}

/** Aviso a las 8:00 de cada día de calor fuerte de los próximos 7 días (plantas de afuera). Ids 900101+. */
export function buildHeatAlerts(plants, climate, getCare, placementLookup, now = new Date()) {
  if (!climate?.days) return [];
  const out = [];
  climate.days.slice(0, 7).forEach((d, i) => {
    const risk = plantsAtHeatRisk(plants, d.max, getCare, placementLookup);
    if (!risk.length) return;
    const at = atTime(d.date, 8, 0);
    if (at <= now) return;
    out.push({
      id: 900101 + i,
      plantId: risk[0].id,
      title: '🥵 Calor fuerte hoy',
      body: `Máxima de ${Math.round(d.max)} °C. Revisá la humedad y dales sombra: ${risk.map((p) => p.name).join(', ')}`,
      at,
    });
  });
  return out;
}
