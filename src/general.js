/* Novedad general: algo que hiciste o notaste en varias plantas a la vez (ej. "regué con té de banana, menos las suculentas").
   Lógica pura: efectos directos en las plantas tildadas, pedido a Gemini y lectura de su respuesta. */
import { dateStr, addNote, waterPlant } from './logic.js';
import { applyFeedback } from './guia.js';
import { extractJson, MAX_ACTIONS } from './novedad.js';

export const KINDS = [
  { id: 'riego', icon: '💧', label: 'Regué' },
  { id: 'abono', icon: '🪱', label: 'Abono / té' },
  { id: 'poda', icon: '✂️', label: 'Poda' },
  { id: 'trasplante', icon: '🪴', label: 'Trasplante' },
  { id: 'plaga', icon: '🐛', label: 'Plaga / tratamiento' },
  { id: 'otra', icon: '📝', label: 'Otra cosa' },
];
const LABEL = { riego: 'Riego', abono: 'Abonar', poda: 'Podar', trasplante: 'Trasplantar', plaga: 'Tratamiento', otra: 'Novedad' };

const whenOf = (date, now) => (date >= dateStr(now) ? now : new Date(`${date}T12:00:00`));

/**
 * Aplica la novedad a las plantas tildadas: nota en el historial; si regaste, registra el riego en esa fecha
 * (solo si es más nuevo que el último); abono, poda y trasplante cuentan como "hecho" en lo de temporada.
 */
export function applyGeneral(plants, { ids, text, date, kinds }, extraOf = () => null, now = new Date()) {
  const when = whenOf(date, now);
  const label = kinds.map((k) => LABEL[k]).filter(Boolean).join(' + ') || 'Novedad';
  return plants.map((p) => {
    if (!ids.includes(p.id)) return p;
    const note = `${label}${text.trim() ? `: ${text.trim()}` : ''}`;
    let next = p;
    if (kinds.includes('riego')) {
      if (!p.lastWatered || date >= p.lastWatered) next = waterPlant(next, when, text.trim());
      else next = addNote(next, `${note} (ya había un riego más reciente)`, when);
    } else {
      next = addNote(next, note, when);
    }
    if (kinds.includes('riego') && (kinds.length > 1 || !text.trim())) {
      // el riego ya quedó anotado con el texto; el resto de las acciones también deja su propia nota
      const rest = kinds.filter((k) => k !== 'riego').map((k) => LABEL[k]).join(' + ');
      if (rest) next = addNote(next, `${rest}: ${text.trim() || 'sin detalle'}`, when);
    }
    for (const k of ['abono', 'poda', 'trasplante']) {
      if (kinds.includes(k)) next = applyFeedback(next, k === 'abono' ? 'abono' : k, LABEL[k], { status: 'hecho', extra: extraOf(next) }, date, when);
    }
    return next;
  });
}

export function buildGeneralPrompt({ text, date, kinds, plants, place, climate, today = dateStr() }) {
  const ctx = plants
    .map((p) => `- id ${p.id}: ${p.name}${p.sci ? ` (${p.sci})` : ''}; lugar: ${p.placementLabel || 'sin dato'}; riego cada ${p.everyDays} días, último riego ${p.lastWatered || 'sin dato'}${p.stage ? `; etapa ${p.stage}` : ''}${p.pending?.length ? `; tareas pendientes: ${p.pending.join(' | ')}` : ''}`)
    .join('\n');
  return `Sos un experto en cuidado de plantas. Hice algo con varias de mis plantas y quiero saber si conviene cambiar o agregar algo.

- Fecha en que lo hice: ${date}${date !== today ? ` (hoy es ${today})` : ''}
- Tipo: ${kinds.map((k) => LABEL[k]).join(', ') || 'otra cosa'}
- Lo que hice o noté: ${text.trim() || '(sin detalle)'}
- Vivo en: ${place?.name || 'Argentina (hemisferio sur)'}${climate ? `; ${Math.round(climate.avgTemp)} °C de media esta semana` : ''}
- Plantas a las que se aplica (SOLO estas):
${ctx}

Respondé SOLO con un JSON con esta forma:
{
  "resumen": "qué implica lo que hice, en 1 o 2 oraciones",
  "general": "consejo que vale para todas, o null",
  "plantas": [
    { "id": "el id exacto de la lista", "evaluacion": "si afecta a esta planta y cómo, en una oración", "alerta": "advertencia concreta o null",
      "tareas": [ { "titulo": "acción corta", "detalle": "cómo hacerla", "en_dias": 0, "repetir_cada_dias": null, "veces": null } ] }
  ]
}
Reglas: incluí solo las plantas de la lista, con su id exacto. Proponé tareas solo si hacen falta de verdad (ej. no regar hasta tal fecha, revisar hojas, repetir en X días); si no hay nada que cambiar, "tareas": []. Máximo ${MAX_ACTIONS} tareas por planta. No inventes: si no estás seguro de algo, decilo en "evaluacion".`;
}

const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const int = (v, a, b) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : null;
};

/** Lee la respuesta de Gemini. Descarta ids que no son de las plantas tildadas. */
export function parseGeneral(raw, validIds) {
  const j = extractJson(raw);
  if (!j || typeof j !== 'object') return null;
  const plantas = (Array.isArray(j.plantas) ? j.plantas : [])
    .filter((p) => p && validIds.includes(p.id))
    .map((p) => ({
      id: p.id,
      evaluacion: text(p.evaluacion, 300),
      alerta: text(p.alerta, 300) || null,
      tareas: (Array.isArray(p.tareas) ? p.tareas : [])
        .map((a) => ({
          titulo: text(a?.titulo, 80),
          detalle: text(a?.detalle, 700),
          en_dias: int(a?.en_dias, 0, 365) ?? 0,
          repetir_cada_dias: Number(a?.repetir_cada_dias) >= 1 ? int(a.repetir_cada_dias, 1, 365) : null,
          veces: Number(a?.veces) >= 1 ? int(a.veces, 1, 30) : null,
        }))
        .filter((a) => a.titulo)
        .slice(0, MAX_ACTIONS),
    }));
  const out = { resumen: text(j.resumen, 400), general: text(j.general, 500) || null, plantas };
  return out.resumen || out.general || plantas.length ? out : null;
}
