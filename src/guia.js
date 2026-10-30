/* Seguimiento de lo de temporada: feedback ("lo hice / todavía no / este año no") y guías paso a paso
   con esperas (cosechar semillas, hacer esquejes). Lógica pura. */
import { addDays, dateStr, addNote } from './logic.js';
import { extractJson, makeTask } from './novedad.js';

/* ---------- Feedback de temporada ---------- */

export const STAGES = ['chica', 'joven', 'adulta'];

/** Primer día en que mira el mes (1-12): hoy si es el mes actual; si no, el próximo 1 de ese mes. */
export function monthStartOf(month, now = new Date()) {
  const cur = now.getMonth() + 1;
  if (month === cur) return dateStr(now);
  const y = month > cur ? now.getFullYear() : now.getFullYear() + 1;
  return `${y}-${String(month).padStart(2, '0')}-01`;
}

/** ¿El usuario ya respondió sobre esto y el silencio sigue vigente en esa fecha? */
export const isHidden = (plant, kind, ymd) => {
  const e = plant.seasonLog?.[kind];
  return !!(e && e.until && e.until > ymd);
};

/** Días de silencio por defecto (sin IA). */
export function defaultDays(status, kind, extra) {
  if (status === 'despues') return 45;
  if (status === 'no') return 270;
  if (kind === 'abono') return extra?.abono?.cadaDias || 30;
  if (kind === 'trasplante') return extra?.trasplante?.cadaMeses ? extra.trasplante.cadaMeses * 30 : 270;
  return 270;
}

const clampInt = (n, a, b) => Math.max(a, Math.min(b, Math.round(n)));

/**
 * Guarda la respuesta del usuario sobre un cuidado de temporada.
 * status: 'hecho' | 'despues' (todavía no) | 'no' (este año no).
 * ai (opcional): { volverEnDias, queMirar, resumen, etapa } leído de Gemini.
 */
export function applyFeedback(plant, kind, label, { status, reason = '', ai = null, extra = null }, today = dateStr(), now = new Date()) {
  const base = defaultDays(status, kind, extra);
  const days = status !== 'hecho' && ai?.volverEnDias ? clampInt(ai.volverEnDias, 3, 365) : base;
  const entry = {
    status,
    reason: reason.trim().slice(0, 300),
    at: now.toISOString(),
    until: addDays(today, days),
    days,
    queMirar: ai?.queMirar || '',
    resumen: ai?.resumen || '',
    ai: !!ai,
  };
  const note =
    status === 'hecho' ? `Hecho: ${label}`
      : status === 'despues' ? `Todavía no: ${label}${entry.reason ? ` — ${entry.reason}` : ''}`
        : `Este año no: ${label}${entry.reason ? ` — ${entry.reason}` : ''}`;
  let next = addNote({ ...plant, seasonLog: { ...(plant.seasonLog || {}), [kind]: entry } }, note, now);
  if (ai?.etapa && STAGES.includes(ai.etapa)) next = { ...next, stage: ai.etapa };
  return next;
}

export function buildFeedbackPrompt({ plant, sci, label, status, reason, stage, place, now = new Date() }) {
  return `Sos un experto en jardinería. Una persona usa una app de cuidado de plantas y la app le propuso "${label}" para esta planta. Respondió lo siguiente:

- Planta: ${plant.name}${sci ? ` (${sci})` : ''}${stage ? `; etapa que ya sabíamos: ${stage}` : ''}
- Vivo en: ${place?.name || 'Argentina (hemisferio sur)'}; hoy es ${dateStr(now)}
- Respuesta: ${status === 'despues' ? 'todavía no lo hizo' : 'decidió no hacerlo este año'}
- Lo que escribió: ${reason.trim() || '(sin explicación)'}

Respondé SOLO con un JSON con esta forma:
{
  "resumen": "una oración que reconozca lo que dijo",
  "volver_en_dias": número de días en que conviene volver a preguntarle,
  "que_mirar": "qué señales o condiciones tiene que ver en la planta para que ya se pueda, en una oración",
  "etapa": "chica" | "joven" | "adulta" | null
}
No inventes: si lo que escribió no alcanza para decidir, usá un número de días prudente y decilo en "que_mirar".`;
}

export function parseFeedback(raw) {
  const j = extractJson(raw);
  if (!j || typeof j !== 'object') return null;
  const days = Number(j.volver_en_dias);
  const t = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const ai = {
    resumen: t(j.resumen, 240),
    queMirar: t(j.que_mirar, 240),
    volverEnDias: days > 0 ? clampInt(days, 3, 365) : null,
    etapa: STAGES.includes(j.etapa) ? j.etapa : null,
  };
  return ai.resumen || ai.queMirar || ai.volverEnDias ? ai : null;
}

/* ---------- Guías paso a paso ---------- */

export const GENERIC_GUIDES = {
  semillas: {
    pasos: [
      { titulo: 'Ver si las semillas están listas', detalle: 'Esperá a que la flor se seque del todo y la cápsula o el fruto se vean marrones y secos. Si todavía están verdes o blandos, falta madurar.', espera_dias: 0, reintento_dias: 4 },
      { titulo: 'Recoger y secar', detalle: 'Cortá la cápsula o el fruto y ponelo sobre papel, en un lugar seco y con sombra, sin sol directo.', espera_dias: 3 },
      { titulo: 'Extraer y limpiar las semillas', detalle: 'Abrí la cápsula, sacá las semillas y descartá lo que sea cáscara o resto de flor. Las que estén chuecas o huecas, se tiran.', espera_dias: 1 },
      { titulo: 'Guardar o sembrar', detalle: 'Guardalas en un sobre de papel rotulado con el nombre y la fecha, en un lugar fresco y seco. Si las vas a sembrar enseguida, armá un proyecto de germinación.', espera_dias: 0 },
    ],
  },
  esqueje: {
    pasos: [
      { titulo: 'Ver si la planta está lista', detalle: 'Tiene que estar sana, con varios tallos y hojas, y de tamaño suficiente. Si es chica o está débil, esperá.', espera_dias: 0, reintento_dias: 14 },
      { titulo: 'Cortar el esqueje', detalle: 'Con una tijera limpia, cortá un tallo sano de 8–10 cm, justo debajo de un nudo. Sacá las hojas de abajo.', espera_dias: 0 },
      { titulo: 'Ponerlo a enraizar', detalle: 'En un vaso con agua (hojas afuera) o en tierra liviana húmeda, con luz sin sol directo. Cambiá el agua cada 4–5 días.', espera_dias: 14 },
      { titulo: 'Ver si hay raíces', detalle: 'Si tiene raíces de 2–3 cm, ya se puede pasar a maceta. Si no, dejalo unos días más.', espera_dias: 0, reintento_dias: 7 },
      { titulo: 'Pasarlo a maceta', detalle: 'Maceta chica con tierra liviana, regá y dejalo en sombra luminosa las primeras semanas.', espera_dias: 0 },
    ],
  },
};

export const guideKindOf = (eventKind) => (eventKind === 'semillas' ? 'semillas' : eventKind === 'esquejes' ? 'esqueje' : null);

export function buildGuidePrompt({ kind, plant, sci, hints = [], place, now = new Date() }) {
  const what = kind === 'semillas' ? 'cosechar, secar, limpiar y guardar las semillas' : 'sacar esquejes y hacerlos enraizar hasta pasarlos a maceta';
  return `Sos un experto en jardinería y propagación. Necesito una guía paso a paso para ${what} de esta planta, con los tiempos de espera entre pasos.

- Planta: ${plant.name}${sci ? ` (${sci})` : ''}
- Vivo en: ${place?.name || 'Argentina (hemisferio sur)'}; hoy es ${dateStr(now)}
${hints.length ? `- Lo que ya sabía la app: ${hints.join(' | ')}\n` : ''}
Respondé SOLO con un JSON con esta forma:
{
  "pasos": [
    { "titulo": "acción corta", "detalle": "cómo hacerla y qué señales mirar", "espera_dias": días a esperar DESPUÉS de este paso antes del siguiente, "reintento_dias": número o null }
  ],
  "seguridad": "alta" | "media" | "baja"
}
Reglas: el primer paso tiene que ser comprobar si la planta o la flor está lista (explicá cómo se ve cuando está lista) con "reintento_dias" = en cuántos días volver a mirar si todavía no. Entre 3 y 7 pasos. Cuando haya que secar o esperar, poné los días reales en "espera_dias". No inventes: si no conocés bien la especie, bajá "seguridad".`;
}

export function parseGuide(raw) {
  const j = extractJson(raw);
  if (!j || typeof j !== 'object' || !Array.isArray(j.pasos)) return null;
  const t = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const pasos = j.pasos
    .map((p) => ({
      titulo: t(p?.titulo, 80),
      detalle: t(p?.detalle, 320),
      espera_dias: Number(p?.espera_dias) >= 0 ? clampInt(Number(p.espera_dias), 0, 365) : 0,
      reintento_dias: Number(p?.reintento_dias) >= 1 ? clampInt(Number(p.reintento_dias), 1, 60) : null,
    }))
    .filter((p) => p.titulo)
    .slice(0, 8);
  if (!pasos.length) return null;
  return { pasos, source: 'Gemini', confidence: ['alta', 'media', 'baja'].includes(j.seguridad) ? j.seguridad : 'media' };
}

function stepTask(plant, guide, i, due, time) {
  const s = guide.steps[i];
  return {
    ...makeTask({ title: s.titulo, detail: s.detalle, due, time, source: 'guia' }),
    guide: guide.kind,
    stepIdx: i,
    retry: s.reintento_dias || null,
  };
}

/** Empieza la guía: crea la tarea del primer paso (para hoy). */
export function startGuide(plant, kind, label, guide, time = '09:00', today = dateStr(), now = new Date()) {
  const g = {
    kind,
    label,
    steps: guide.pasos.map((p) => ({ titulo: p.titulo, detalle: p.detalle, espera_dias: p.espera_dias, reintento_dias: p.reintento_dias })),
    idx: 0,
    done: false,
    source: guide.source || 'plantilla',
    confidence: guide.confidence || null,
    startedAt: now.toISOString(),
  };
  const tasks = (plant.tasks || []).filter((t) => t.guide !== kind);
  return addNote({ ...plant, guide: g, tasks: [...tasks, stepTask(plant, g, 0, today, time)] }, `Empezó la guía: ${label}`, now);
}

/** Terminó el paso de una guía: agenda el siguiente después de la espera. Devuelve la planta actualizada (o igual si no era una guía). */
export function advanceGuide(plant, tid, time = '09:00', today = dateStr(), now = new Date()) {
  const task = (plant.tasks || []).find((t) => t.id === tid);
  if (!task || !task.guide || !plant.guide || plant.guide.kind !== task.guide) return plant;
  const g = plant.guide;
  const i = task.stepIdx;
  const rest = (plant.tasks || []).filter((t) => t.id !== tid);
  const note = `✓ ${g.label}: ${g.steps[i]?.titulo || 'paso'}`;
  if (i + 1 >= g.steps.length) return addNote({ ...plant, guide: { ...g, idx: i + 1, done: true }, tasks: rest }, note, now);
  const due = addDays(today, g.steps[i].espera_dias || 0);
  const ng = { ...g, idx: i + 1 };
  return addNote({ ...plant, guide: ng, tasks: [...rest, stepTask(plant, ng, i + 1, due, time)] }, note, now);
}

/** "Todavía no": vuelve a preguntar el mismo paso en `retry` días. */
export function retryStep(plant, tid, today = dateStr()) {
  const task = (plant.tasks || []).find((t) => t.id === tid);
  if (!task) return plant;
  const days = task.retry || 3;
  return { ...plant, tasks: plant.tasks.map((t) => (t.id === tid ? { ...t, due: addDays(today, days) } : t)) };
}

export const cancelGuide = (plant) => ({ ...plant, guide: null, tasks: (plant.tasks || []).filter((t) => !t.guide) });

