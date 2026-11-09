/* "Sumar novedad": pedido para Gemini, lectura de la respuesta y tareas con recordatorio.
   Todo lógica pura (sin red ni pantalla). */
import { dateStr, addDays, daysBetween, atTime } from './logic.js';
import { looksLikeQuestions, QUESTIONS_MSG } from './chat.js';

export const MAX_PHOTOS = 3;
export const MAX_ACTIONS = 8;
export const OVERDUE_REMINDERS = 3;

const GRAVEDAD = ['leve', 'moderada', 'seria'];
const CONFIANZA = ['alta', 'media', 'baja'];

/** Texto que el usuario lleva a la app de Gemini junto con las fotos. */
export function buildPrompt({ plant, care, placement, place, climate, text, photoCount, today = dateStr(), zone = '' }) {
  const ctx = [
    `- Planta: ${plant.name}${plant.sci ? ` (${plant.sci})` : plant.species ? ` (${plant.species})` : ''}`,
    `- Dónde está: ${placement?.label || 'sin dato'}${plant.location ? ` (${plant.location})` : ''}${zone ? `. Lugar en mi casa: ${zone}` : ''}`,
    plant.water ? '- La tengo en agua (frasco), no en tierra: en lugar de riego, renuevo el agua' : null,
    place ? `- Ciudad: ${place.name}` : null,
    climate ? `- Clima de la semana: ${Math.round(climate.avgTemp)} °C de media, mínima de ${Math.round(climate.minNext3)} °C en los próximos 3 días` : null,
    plant.water ? `- Cambio de agua: cada ${plant.everyDays} días, último cambio ${plant.lastWatered}` : `- Riego actual: cada ${plant.everyDays} días, último riego ${plant.lastWatered}`,
    care ? `- Cuidados típicos de la especie: riego cada ~${care.days} días, ${care.light || ''}`.trim() : null,
    `- Fecha de hoy: ${today}`,
  ].filter(Boolean);
  const recent = (plant.history || []).filter((h) => h.type === 'novedad').slice(0, 2);
  const prev = recent.length
    ? `\nNovedades anteriores de esta planta:\n${recent.map((h) => `- ${h.at.slice(0, 10)}: ${h.note || ''}${h.diagnosis?.causa ? ` → ${h.diagnosis.causa}` : ''}`).join('\n')}\n`
    : '';
  const pending = (plant.tasks || []).filter((t) => t.source === 'novedad');
  const pend = pending.length
    ? `\nTareas pendientes que ya tengo de esas novedades (si el diagnóstico cambió, reemplazan a estas):\n${pending.map((t) => `- ${t.due}: ${t.title}`).join('\n')}\n`
    : '';
  return `Sos un experto en cuidado de plantas. Te paso ${photoCount ? `${photoCount} foto${photoCount === 1 ? '' : 's'} y ` : ''}el contexto de una planta mía.

${ctx.join('\n')}
${prev}${pend}
Lo que noté: ${text.trim() || '(sin descripción, mirá las fotos)'}

Respondé SOLO con un bloque JSON (sin texto antes ni después) con exactamente esta forma:
{
  "resumen": "qué ves, en 1 o 2 oraciones",
  "causa_probable": "la causa más probable",
  "confianza": "alta" | "media" | "baja",
  "gravedad": "leve" | "moderada" | "seria",
  "acciones": [
    { "titulo": "acción corta y concreta", "detalle": "cómo hacerla", "en_dias": 0, "repetir_cada_dias": null, "veces": null }
  ],
  "dudas": ["qué dato o foto te ayudaría a estar más seguro (opcional)"]
}
Reglas: "en_dias" es en cuántos días hacer la acción (0 = hoy). Si es un seguimiento periódico (ej. revisar cada 10 días), poné "repetir_cada_dias": 10 y "veces": cuántas veces repetirlo (o null si no tiene fin). Máximo ${MAX_ACTIONS} acciones. Si hay novedades anteriores y lo que te cuento ahora cambia o corrige ese diagnóstico, decilo claramente en "resumen" y dame el plan completo actualizado. Si no estás seguro, decilo en "confianza" y no inventes.`;
}

/** Pedido para convertir en tareas un texto que Gemini ya le dio al usuario (sin volver a explicar el caso). */
export function buildConvertPrompt({ plant, text, today = dateStr() }) {
  return `Te paso una respuesta que ya me dieron sobre mi planta "${plant.name}"${plant.sci ? ` (${plant.sci})` : ''} (hoy es ${today}). Convertila en tareas con fechas, usando SOLO lo que dice el texto, sin agregar ni inventar pasos.

Texto:
"""
${String(text).trim().slice(0, 6000)}
"""

Respondé SOLO con un bloque JSON (sin texto antes ni después) con exactamente esta forma:
{
  "resumen": "qué diagnóstico o situación describe el texto, en 1 o 2 oraciones",
  "causa_probable": "la causa que menciona el texto",
  "confianza": "alta" | "media" | "baja",
  "gravedad": "leve" | "moderada" | "seria",
  "acciones": [
    { "titulo": "acción corta y concreta", "detalle": "cómo hacerla, con lo que diga el texto", "en_dias": 0, "repetir_cada_dias": null, "veces": null }
  ],
  "dudas": []
}
Reglas: "en_dias" es en cuántos días hacer la acción según el texto (0 = hoy). Si el texto pide algo periódico (ej. revisar cada 3 días durante 2 semanas), poné "repetir_cada_dias" y "veces". Máximo ${MAX_ACTIONS} acciones.`;
}

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const intIn = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
};

/** Saca el JSON de lo que pegó el usuario (con o sin ```json, con texto alrededor). */
export function extractJson(raw) {
  let t = String(raw || '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1).replace(/[“”]/g, '"').replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Valida y normaliza la respuesta. { ok, result } o { ok:false, error } */
export function parseAnswer(raw) {
  if (!String(raw || '').trim()) return { ok: false, error: 'Pegá primero la respuesta de Gemini.' };
  const j = extractJson(raw);
  if (!j || typeof j !== 'object') {
    if (looksLikeQuestions(raw)) return { ok: false, error: QUESTIONS_MSG };
    return { ok: false, error: 'No pude leer la respuesta. Pedile a Gemini: "respondé solo con el bloque JSON" y pegala de nuevo.' };
  }
  const actions = (Array.isArray(j.acciones) ? j.acciones : [])
    .map((a) => ({
      titulo: str(a?.titulo, 80),
      detalle: str(a?.detalle, 700),
      en_dias: intIn(a?.en_dias, 0, 365) ?? 0,
      repetir_cada_dias: Number(a?.repetir_cada_dias) >= 1 ? intIn(a.repetir_cada_dias, 1, 365) : null,
      veces: Number(a?.veces) >= 1 ? intIn(a.veces, 1, 30) : null,
    }))
    .filter((a) => a.titulo)
    .slice(0, MAX_ACTIONS);
  const result = {
    resumen: str(j.resumen, 400),
    causa: str(j.causa_probable, 300),
    confianza: CONFIANZA.includes(String(j.confianza).toLowerCase()) ? String(j.confianza).toLowerCase() : 'media',
    gravedad: GRAVEDAD.includes(String(j.gravedad).toLowerCase()) ? String(j.gravedad).toLowerCase() : 'leve',
    acciones: actions,
    dudas: (Array.isArray(j.dudas) ? j.dudas : []).map((d) => str(d, 160)).filter(Boolean).slice(0, 4),
  };
  if (!result.resumen && !result.causa && !actions.length) {
    return { ok: false, error: 'La respuesta no trae diagnóstico ni acciones. Probá pedírsela de nuevo a Gemini.' };
  }
  return { ok: true, result };
}

/* ---------- Tareas ---------- */

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Crea una tarea. every = cada cuántos días se repite (null = una sola vez); left = veces que faltan (null = sin fin). */
export function makeTask({ title, detail = '', due, time = '09:00', every = null, left = null, source = 'novedad', months = null }) {
  return {
    months: months && months.length ? months : null,
    id: newId(),
    title: String(title).slice(0, 80),
    detail: String(detail).slice(0, 700),
    due,
    time,
    every: every || null,
    left: every ? left : null,
    source,
  };
}

/** De las acciones elegidas (con fecha y hora) a tareas. */
export function tasksFromActions(picks, today = dateStr()) {
  return picks.map((p) =>
    makeTask({
      title: p.titulo,
      detail: p.detalle,
      due: addDays(today, p.en_dias),
      time: p.time || '09:00',
      every: p.repetir_cada_dias,
      left: p.veces,
    }),
  );
}

/**
 * Marca una tarea como hecha. Si se repite y quedan veces, reprograma la siguiente
 * (contando desde hoy, que es cuando realmente se hizo). Devuelve la lista nueva.
 */
export function completeTask(tasks, id, today = dateStr()) {
  const out = [];
  for (const t of tasks) {
    if (t.id !== id) {
      out.push(t);
      continue;
    }
    if (t.every && (t.left === null || t.left > 1)) {
      let due = addDays(today, t.every);
      // tareas de temporada (ej. abonar): si cae fuera de los meses indicados, pasa al primer día de la próxima temporada
      for (let k = 0; t.months && !t.months.includes(Number(due.slice(5, 7))) && k < 400; k++) due = addDays(due, 1);
      out.push({ ...t, due, left: t.left === null ? null : t.left - 1 });
    }
  }
  return out;
}

export const removeTask = (tasks, id) => tasks.filter((t) => t.id !== id);

export const taskState = (t, today = dateStr()) => {
  const d = daysBetween(today, t.due);
  return d < 0 ? 'late' : d === 0 ? 'today' : 'later';
};

/** Hora efectiva: la propia de la tarea si la cambió a mano; si no, la hora general de los avisos. */
export const taskTime = (t, defaultTime = '09:00') => (t.timeCustom && /^\d{2}:\d{2}$/.test(t.time || '') ? t.time : defaultTime);

export function taskText(t, today = dateStr(), defaultTime = '09:00') {
  const d = daysBetween(today, t.due);
  const when = d < 0 ? (d === -1 ? 'venció ayer' : `venció hace ${-d} días`) : d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`;
  const rep = t.every ? ` · se repite cada ${t.every} días${t.left ? ` (${t.left} ${t.left === 1 ? 'vez' : 'veces'})` : ''}` : '';
  return `${when} · ${taskTime(t, defaultTime)}${t.time2 ? ` y ${t.time2}` : ''}${rep}`;
}

/** Tareas vencidas o de hoy, para el aviso de la lista. */
export function dueTasks(plants, today = dateStr()) {
  const out = [];
  for (const p of plants) for (const t of p.tasks || []) if (daysBetween(today, t.due) <= 0) out.push({ plant: p, task: t });
  return out;
}

/** Notificaciones de tareas: una a su hora y hasta 3 más si se pasa. Ids desde 1.000.000 (no chocan con riego ni frío). */
export function buildTaskSchedule(plants, now = new Date(), defaultTime = '09:00') {
  const today = dateStr(now);
  const all = [];
  for (const p of plants) for (const t of p.tasks || []) all.push({ p, t });
  all.sort((a, b) => (a.t.due + a.t.id).localeCompare(b.t.due + b.t.id));
  const out = [];
  all.forEach(({ p, t }, idx) => {
    const times = [taskTime(t, defaultTime), /^\d{2}:\d{2}$/.test(t.time2 || '') ? t.time2 : null].filter(Boolean);
    const start = daysBetween(today, t.due) >= 0 ? t.due : today;
    for (let k = 0; k <= OVERDUE_REMINDERS; k++) {
      times.forEach((tm, si) => {
        const [h, m] = tm.split(':').map(Number);
        const at = atTime(addDays(start, k), h || 0, m || 0);
        if (at <= now) return;
        const late = daysBetween(t.due, addDays(start, k));
        out.push({
          id: 1000000 + idx * 10 + k * 2 + si,
          plantId: p.id,
          title: late === 0 ? `${p.name}: ${t.title}` : `Pendiente en ${p.name}: ${t.title}`,
          body: t.detail || (late === 0 ? 'Tenés una tarea para hoy 🌿' : 'Se te pasó esta tarea.'),
          at,
        });
      });
    }
  });
  return out;
}
