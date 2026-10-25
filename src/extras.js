/* Calendario de cuidados de temporada (lógica pura). Los meses son los del hemisferio de quien usa la app:
   la IA ya los devuelve para su ciudad. */
import { atTime, dateStr } from './logic.js';

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const REPRO = {
  semilla: ['sembrar', 'Sembrar'],
  esqueje: ['esquejes', 'Hacer esquejes'],
  division: ['dividir', 'Dividir la planta'],
  hijuelos: ['hijuelos', 'Separar hijuelos'],
  acodo: ['acodo', 'Hacer acodos'],
};

/** Todo lo que hay que hacer con una especie a lo largo del año. */
export function eventsOf(extra) {
  if (!extra) return [];
  const out = [];
  if (extra.abono) {
    const ev = extra.abono.cadaDias ? `Cada ${extra.abono.cadaDias} días en temporada. ` : '';
    out.push({ kind: 'abono', icon: '🪱', label: 'Abonar', months: extra.abono.meses, text: ev + (extra.abono.conLoQueTengo || extra.abono.detalle || ''), steps: [] });
  }
  if (extra.poda) out.push({ kind: 'poda', icon: '✂️', label: 'Podar', months: extra.poda.meses, text: extra.poda.detalle, steps: [] });
  if (extra.trasplante) {
    const ev = extra.trasplante.cadaMeses ? `Cada ${extra.trasplante.cadaMeses} meses aprox. ` : '';
    out.push({ kind: 'trasplante', icon: '🪴', label: 'Trasplantar', months: extra.trasplante.meses, text: ev + (extra.trasplante.detalle || ''), steps: [] });
  }
  for (const m of extra.reproduccion?.metodos || []) {
    const [kind, label] = REPRO[m.tipo];
    out.push({ kind, icon: '🌱', label, months: m.meses, text: '', steps: m.pasos });
  }
  const s = extra.reproduccion?.semillas;
  if (s) out.push({ kind: 'semillas', icon: '🌰', label: 'Cosechar semillas', months: s.meses, text: '', steps: s.pasos });
  return out;
}

/** Eventos que caen en un mes (1-12) para todas las plantas. */
export function eventsInMonth(plants, getExtra, month) {
  const out = [];
  for (const p of plants) {
    for (const ev of eventsOf(getExtra(p))) {
      if (ev.months.includes(month)) out.push({ plant: p, event: ev });
    }
  }
  return out;
}

/** Texto corto del mes: "Abonar: A, B · Podar: C". */
export function digestText(items) {
  const by = new Map();
  for (const { plant, event } of items) {
    if (!by.has(event.label)) by.set(event.label, []);
    by.get(event.label).push(plant.name);
  }
  return [...by].map(([label, names]) => `${label}: ${names.join(', ')}`).join(' · ');
}

/**
 * Un aviso por mes (el día 1 a las 10:00) con lo que toca ese mes, para los próximos 12 meses.
 * Ids 900301+. Si no hay nada ese mes, no hay aviso.
 */
export function buildMonthlyDigests(plants, getExtra, now = new Date(), horizon = 12) {
  const out = [];
  for (let k = 0; k < horizon; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const at = atTime(dateStr(d), 10, 0);
    if (at <= now) continue;
    const items = eventsInMonth(plants, getExtra, d.getMonth() + 1);
    if (!items.length) continue;
    out.push({
      id: 900301 + k,
      plantId: items[0].plant.id,
      title: `🌿 ${MONTHS[d.getMonth()][0].toUpperCase()}${MONTHS[d.getMonth()].slice(1)}: cuidados de temporada`,
      body: digestText(items).slice(0, 220),
      at,
    });
  }
  return out;
}

/** "marzo y abril", "septiembre a noviembre" */
export function monthsText(months) {
  if (!months?.length) return '';
  const runs = [];
  for (const m of months) {
    const last = runs[runs.length - 1];
    if (last && m === last[last.length - 1] + 1) last.push(m);
    else runs.push([m]);
  }
  if (months.length === 12) return 'todo el año';
  return runs
    .map((r) => (r.length === 1 ? MONTHS[r[0] - 1] : r.length === 2 ? `${MONTHS[r[0] - 1]} y ${MONTHS[r[1] - 1]}` : `${MONTHS[r[0] - 1]} a ${MONTHS[r[r.length - 1] - 1]}`))
    .join(', ');
}
