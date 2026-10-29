/* Proyectos (germinar semillas, bonsái, etc.): plantillas, plan con IA, etapas → tareas con aviso. Lógica pura. */
import { addDays, daysBetween, dateStr } from './logic.js';
import { extractJson, makeTask } from './novedad.js';
import { seasonOf } from './ai.js';

export const MAX_STAGES = 20;

const st = (dia, titulo, detalle, cada = null, veces = null) => ({ dia, titulo, detalle, cada, veces });

/* ---------- Plantillas (funcionan sin internet ni clave) ---------- */

const PEAR_BONSAI = [
  st(100, 'Plantín en maceta: sol y abono suave', 'Ya en maceta, ponelo afuera a pleno sol (de a poco los primeros días). Abonalo con humus cada 3–4 semanas en primavera y verano. No lo podes: tiene que engrosar el tronco.'),
  st(300, 'Primer invierno: dejarlo afuera', 'Es de hoja caduca y necesita el frío del invierno para descansar. Regá poco y no lo entres a la casa. Si ya se ve robusto, pasalo a una maceta más grande, sin cortar todavía la raíz principal.'),
  st(665, 'Segundo invierno: cortar la raíz principal', 'En julio-agosto, antes de que brote: sacalo de la maceta, cortá la raíz más larga y repartí las raíces hacia los costados. Así se forman raíces superficiales y parejas (la base visual del bonsái). Fecha aproximada: ajustala a la estación.'),
  st(1030, 'Evaluar el tronco', 'Si el tronco ya tiene 2–3 cm de grosor, en el próximo invierno se corta a la altura que quieras y se elige una rama nueva como punta. Si es más fino, seguí engrosando un año más.'),
  st(1400, 'Poda de formación y alambrado', 'Con las ramas jóvenes (flexibles) se empieza a dar forma con poda y alambre, en otoño-invierno. Revisá el alambre cada mes para que no se marque en la corteza.'),
];

export const TEMPLATES = [
  {
    id: 'estratificacion',
    icon: '🍐',
    name: 'Semillas de frutales por frío (pera, manzana, carozo)',
    desc: 'Estratificación en frío en la heladera, con revisiones y aviso de cuándo buscar raicitas.',
    options: [{ id: 'bonsai', label: 'Agregar la ruta de bonsái a varios años' }],
    build: (opts = {}) => ({
      resumen: 'Las semillas de frutales de clima templado necesitan 60 a 90 días de frío húmedo para germinar. Se hace en la heladera, y después se plantan.',
      materiales: ['Papel de cocina (mejor que algodón)', 'Bolsa tipo ziploc', 'Las semillas limpias, sin dejar que se sequen', 'Maceta con tierra suelta y drenaje (para después)'],
      consejos: [
        'Papel húmedo pero escurrido: si gotea, está de más.',
        'Dejá la bolsa casi cerrada, con una pequeña apertura para que circule el aire.',
        'Mejor en un estante del medio, lejos de la puerta: la temperatura ideal es de 1 a 5 °C.',
        'Poné más semillas de las que necesitás: no todas germinan.',
      ],
      alertas: [
        'Moho: lavá la semilla con agua y cambiá el papel.',
        'Semilla blanda, negra o con mal olor: descartala.',
        'Si sale una raicita blanca antes de tiempo, plantala enseguida; no esperes al día 90.',
      ],
      etapas: [
        st(0, 'Armar la bolsa en la heladera', 'Papel de cocina húmedo (escurrido), semillas separadas entre sí, bolsa casi cerrada, en un estante del medio.'),
        st(7, 'Revisar humedad y moho', 'El papel tiene que seguir húmedo. Si hay moho, lavá la semilla y cambiá el papel. Descartá las semillas blandas.', 7, 8),
        st(45, 'Mirar las semillas a fondo', 'Algunas pueden empezar a abrirse. Una raicita blanca de 1 cm o más significa que ya hay que plantarla.'),
        st(60, 'Buscar raicitas', 'Desde ahora pueden brotar. Si ves una raíz de 1 cm o más, plantala con la raíz hacia abajo, 1–2 cm de profundidad, en tierra suelta y húmeda, con luz pero sin sol fuerte las primeras semanas.', 3, 11),
        st(90, 'Fin del frío: plantar todo', 'Plantá todas las semillas, hayan brotado o no, en maceta con tierra suelta. Regá y esperá 3–4 semanas. Si ninguna brota, podés volver a ponerlas 2–3 semanas más en la heladera.'),
        ...(opts.bonsai ? PEAR_BONSAI : []),
      ],
    }),
  },
  {
    id: 'palta',
    icon: '🥑',
    name: 'Palta desde la semilla',
    desc: 'Germinación en agua con palillos, cambio de agua cada 5 días y pasaje a maceta.',
    options: [],
    build: () => ({
      resumen: 'La semilla de palta germina en agua en 2 a 8 semanas. Primero sale la raíz y después el tallo.',
      materiales: ['Un vaso o frasco', '3 o 4 palillos', 'Agua limpia', 'Luz indirecta y lugar cálido (20–25 °C)'],
      consejos: [
        'La mitad ancha de la semilla va hacia abajo y tiene que quedar sumergida; la punta queda afuera.',
        'Cambiá el agua cada 5 días para que no se ponga turbia.',
        'Paciencia: puede tardar hasta 8 semanas en abrirse.',
      ],
      alertas: ['Moho o agua con mal olor: lavá la semilla y cambiá el agua.', 'Si a las 8–10 semanas no pasó nada, probablemente no germine.'],
      etapas: [
        st(0, 'Preparar la semilla en agua', 'Lavá la semilla, clavale 3 palillos a mitad de altura y apoyala en el vaso con la parte ancha sumergida. Luz indirecta.'),
        st(5, 'Cambiar el agua y revisar', 'Agua limpia. Fijate si aparece una grieta o una raíz blanca.', 5, 12),
        st(30, 'Primer control: ¿se abrió?', 'Es normal que a esta altura recién se parta la semilla. Si hay raíz, seguí; si no, paciencia hasta la semana 8.'),
        st(60, 'Pasar a maceta si hay raíz y tallo', 'Cuando la raíz mida 8–10 cm y salga un brote, pasala a maceta con buen drenaje, dejando la mitad superior de la semilla afuera de la tierra.'),
        st(120, 'Pinzar la punta', 'Cuando el tallo mida unos 15–20 cm, cortale la punta para que ramifique y quede más tupida.'),
      ],
    }),
  },
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id);

/* ---------- Plan a medida con IA ---------- */

export function buildPlanPrompt({ name, description, startDate, today = dateStr(), place, climate, now = new Date() }) {
  return `Sos un experto en jardinería, germinación de semillas y bonsái. Quiero armar un proyecto con un plan de etapas y seguimientos con fechas.

- Proyecto: ${name}
- Fecha de inicio: ${startDate}${startDate < today ? ` (ya empezó; hoy es ${today})` : ''}
- Vivo en: ${place?.name || 'Argentina (hemisferio sur)'}; estación actual: ${seasonOf(now, place?.lat)}${climate ? `; temperatura media de la semana ${Math.round(climate.avgTemp)} °C` : ''}
- Lo que quiero hacer y el método que pienso usar:
${description.trim() || '(sin descripción)'}

Respondé SOLO con un JSON con esta forma:
{
  "resumen": "de qué trata el plan, en 1 o 2 oraciones",
  "materiales": ["lista corta"],
  "consejos": ["hasta 5 consejos concretos"],
  "alertas": ["señales de que algo sale mal y qué hacer, hasta 4"],
  "etapas": [
    { "dia": 0, "titulo": "acción corta", "detalle": "cómo hacerlo", "cada_dias": null, "veces": null }
  ],
  "seguridad": "alta" | "media" | "baja"
}
Reglas: "dia" es la cantidad de días desde la fecha de inicio (0 = el día de inicio). Para un control periódico (ej. revisar la humedad cada 7 días) poné "cada_dias" y "veces" (cuántas veces repetirlo). Máximo ${MAX_STAGES} etapas, ordenadas por día. Si el método que describo es dudoso o incorrecto, corregilo en los consejos. No inventes: si no estás seguro, bajá "seguridad".`;
}

const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const lines = (v, n, len = 220) => (Array.isArray(v) ? v : []).map((x) => text(String(x), len)).filter(Boolean).slice(0, n);

/** Valida el plan que devolvió la IA. { ok, plan } o { ok:false, error } */
export function parsePlan(raw) {
  if (!String(raw || '').trim()) return { ok: false, error: 'Pegá primero la respuesta de Gemini.' };
  const j = extractJson(raw);
  if (!j || typeof j !== 'object') return { ok: false, error: 'No pude leer el plan. Pedile a Gemini que responda solo con el bloque JSON y pegalo de nuevo.' };
  const etapas = (Array.isArray(j.etapas) ? j.etapas : [])
    .map((e) => {
      const dia = Math.round(Number(e?.dia));
      const cada = Number(e?.cada_dias) >= 1 ? Math.min(365, Math.round(Number(e.cada_dias))) : null;
      const veces = cada && Number(e?.veces) >= 1 ? Math.min(200, Math.round(Number(e.veces))) : null;
      return { dia: Number.isFinite(dia) ? Math.max(0, Math.min(3650, dia)) : null, titulo: text(e?.titulo, 80), detalle: text(e?.detalle, 320), cada, veces };
    })
    .filter((e) => e.dia !== null && e.titulo)
    .sort((a, b) => a.dia - b.dia)
    .slice(0, MAX_STAGES);
  if (!etapas.length) return { ok: false, error: 'El plan no trae etapas con fechas. Probá pedírselo de nuevo a Gemini.' };
  return {
    ok: true,
    plan: {
      resumen: text(j.resumen, 400),
      materiales: lines(j.materiales, 10, 100),
      consejos: lines(j.consejos, 6),
      alertas: lines(j.alertas, 5),
      etapas,
      source: 'Gemini',
      confidence: ['alta', 'media', 'baja'].includes(j.seguridad) ? j.seguridad : 'media',
    },
  };
}

/* ---------- Etapas, fechas y tareas ---------- */

export const stageEnd = (s) => s.dia + (s.cada && s.veces ? s.cada * (s.veces - 1) : 0);
export const planDays = (plan) => Math.max(0, ...plan.etapas.map(stageEnd));

/** 'futura' | 'en curso' | 'pasada' según el día del proyecto. */
export function stageState(stage, startDate, today = dateStr()) {
  const elapsed = daysBetween(startDate, today);
  if (elapsed < stage.dia) return 'futura';
  if (elapsed > stageEnd(stage)) return 'pasada';
  return 'en curso';
}

/**
 * Tarea con aviso para una etapa. Si el proyecto ya empezó, las repeticiones que ya pasaron se saltean
 * y las que quedan arrancan en la primera fecha futura (o de hoy). Devuelve null si ya no queda nada.
 */
export function stageTask(stage, startDate, today = dateStr(), time = '09:00') {
  const elapsed = daysBetween(startDate, today);
  let k = 0;
  let left = null;
  if (stage.cada) {
    if (elapsed > stage.dia) k = Math.ceil((elapsed - stage.dia) / stage.cada);
    if (stage.veces) {
      left = stage.veces - k;
      if (left <= 0) return null;
    }
  } else if (elapsed > stage.dia) {
    return null;
  }
  return makeTask({
    title: stage.titulo,
    detail: stage.detalle,
    due: addDays(startDate, stage.dia + k * (stage.cada || 0)),
    time,
    every: stage.cada,
    left,
    source: 'proyecto',
  });
}

export function createProject({ name, templateId = null, description = '', startDate, plan, icon = '🌱', photo = '', tasks = [] }, now = new Date()) {
  return {
    id: `j${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 60),
    icon,
    templateId,
    description: description.slice(0, 4000),
    startDate,
    createdAt: now.toISOString(),
    photo,
    plan,
    tasks,
    log: [],
    done: false,
  };
}

export function projectProgress(project, today = dateStr()) {
  const day = Math.max(0, daysBetween(project.startDate, today));
  const total = planDays(project.plan);
  return { day, total, pct: total ? Math.min(100, Math.round((day / total) * 100)) : 0, notStarted: daysBetween(project.startDate, today) < 0 };
}

export function addLog(project, entry, now = new Date()) {
  return { ...project, log: [{ at: now.toISOString(), ...entry }, ...project.log].slice(0, 300) };
}
