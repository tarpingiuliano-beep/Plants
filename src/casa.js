/* Lugares de la casa (sol, calor, adentro/afuera) y qué tan bien le queda cada planta.
   Las horas de sol son estimaciones armadas con fotos a distintas horas: se editan desde la app. Lógica pura. */
import { lightLabel } from './species.js';

export const DEFAULT_ZONES = [
  {
    id: 'patio-sol', name: 'Patio · centro e izquierda', light: 4, outdoor: true, hot: false, placement: 'jardin',
    sun: 'Sol directo ~8 h (de ~9 a 17 h)', note: 'El lugar con más sol. Subí las macetas sobre ladrillos o madera: el cemento se calienta.',
  },
  {
    id: 'patio-der', name: 'Patio · franja de la pared derecha', light: 3.5, outdoor: true, hot: false, placement: 'balcon',
    sun: 'Sombra hasta ~12:30 y sol de tarde ~4–5 h (12:30–17 h)', note: 'La pared acumula calor: necesita riego más seguido.',
  },
  {
    id: 'borde', name: 'Borde de la ventana (1er piso)', light: 3, outdoor: true, hot: false, placement: 'balcon',
    sun: 'Luz brillante y sol directo ~3–4 h (de ~15:30 al atardecer) en verano', note: 'En invierno el sol entra mucho más y más temprano.',
  },
  {
    id: 'baja', name: 'Adentro · planta baja (ventana del frente)', light: 2, outdoor: false, hot: false, placement: 'interior-luz',
    sun: 'Luz filtrada y más fresco', note: 'Sin pegarlas al vidrio o con cortina fina: el frente da al norte-noroeste y el vidrio concentra el sol.',
  },
  {
    id: 'alta', name: 'Adentro · planta alta', light: 2.5, outdoor: false, hot: true, placement: 'interior-luz',
    sun: 'Es la parte más calurosa de la casa', note: 'Plantas que no toleran más de ~30 °C sufren acá en verano.',
  },
];

export const LIGHT_OPTIONS = [
  [1, 'Poca luz'],
  [2, 'Luz brillante, sin sol directo'],
  [3, 'Mucha luz, algo de sol'],
  [4, 'Sol directo'],
];

export const zoneOf = (zones, id) => (zones || []).find((z) => z.id === id) || null;

/** Lugar "genérico" de la app (riego/clima) que corresponde a una zona. */
export const placementFor = (z) => (z.outdoor ? (Number(z.light) >= 3.75 ? 'jardin' : 'balcon') : Number(z.light) <= 1.5 ? 'interior-poca' : 'interior-luz');

/** Normaliza zonas guardadas o importadas. */
export function cleanZones(list) {
  const out = (Array.isArray(list) ? list : [])
    .filter((z) => z && typeof z === 'object' && typeof z.id === 'string' && z.id && typeof z.name === 'string')
    .map((z) => ({
      id: z.id.slice(0, 40),
      name: z.name.trim().slice(0, 60) || 'Lugar',
      light: Math.max(1, Math.min(4, Number(z.light) || 2)),
      outdoor: !!z.outdoor,
      hot: !!z.hot,
      placement: ['interior-poca', 'interior-luz', 'balcon', 'jardin'].includes(z.placement) ? z.placement : placementFor(z),
      sun: String(z.sun || '').slice(0, 120),
      note: String(z.note || '').slice(0, 200),
    }));
  return out;
}

/**
 * Qué tan bien le queda una zona a una especie.
 * score: 0 = ideal; mientras más alto, peor. level: 'bien' | 'ojo' | 'mal' | 'sin-datos'
 */
export function fitZone(care, zone, climate) {
  if (!care || care.generic) return { level: 'sin-datos', score: 0, reasons: ['No tengo datos de esta especie para evaluarla.'] };
  const reasons = [];
  let score = 0;
  const diff = zone.light - care.light;
  if (diff >= 1) {
    score += diff;
    reasons.push(`Recibe más luz de la que pide (pide: ${lightLabel(care.light).toLowerCase()}).`);
  } else if (diff <= -1) {
    score += -diff;
    reasons.push(`Le falta luz: pide ${lightLabel(care.light).toLowerCase()}.`);
  } else score += Math.abs(diff) * 0.5;
  if (zone.hot && Number.isFinite(care.maxTemp) && care.maxTemp <= 32) {
    score += 2.5;
    reasons.push(`No tolera más de ${care.maxTemp} °C y ese lugar es caluroso.`);
  }
  if (zone.outdoor && Number.isFinite(climate?.minNext3) && climate.minNext3 <= care.minTemp + 1) {
    score += 3;
    reasons.push(`Con la mínima de ${Math.round(climate.minNext3)} °C de estos días tendría que estar adentro (aguanta hasta ${care.minTemp} °C).`);
  } else if (zone.outdoor && care.outdoorOk === false) {
    score += 0.75;
    reasons.push('Suele vivir mejor adentro: afuera sufre con el clima.');
  }
  if (!zone.outdoor && care.humidity === 'alta') {
    score += 0.25;
    reasons.push('Le gusta la humedad: ponela con otras plantas o sobre una bandeja con piedras y agua.');
  }
  const level = score <= 0.75 ? 'bien' : score <= 1.5 ? 'ojo' : 'mal';
  return { level, score, reasons };
}

/** Mejor zona para una especie. Devuelve { zone, fit } o null. */
export function bestZone(care, zones, climate, exceptId = null) {
  const ranked = (zones || [])
    .filter((z) => z.id !== exceptId)
    .map((z) => ({ zone: z, fit: fitZone(care, z, climate) }))
    .sort((a, b) => a.fit.score - b.fit.score);
  return ranked[0] || null;
}

/**
 * Evaluación de una planta. { state: 'sin-lugar'|'bien'|'ojo'|'mal'|'sin-datos', zone, fit, move }
 * move = { zone, fit } si conviene un lugar claramente mejor (al menos 0,75 de diferencia).
 */
export function assess(plant, care, zones, climate) {
  const zone = zoneOf(zones, plant.zone);
  const best = bestZone(care, zones, climate, zone?.id);
  if (!zone) {
    return { state: 'sin-lugar', zone: null, fit: null, move: care && !care.generic ? best : null };
  }
  const fit = fitZone(care, zone, climate);
  const move = best && fit.level !== 'sin-datos' && fit.score - best.fit.score >= 0.75 && fit.level !== 'bien' ? best : null;
  return { state: fit.level, zone, fit, move };
}

export const LEVEL_ICON = { bien: '✅', ojo: '⚠️', mal: '🚫', 'sin-datos': '❔', 'sin-lugar': '📍' };
