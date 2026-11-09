/* Plantas que viven en agua (frasco) en vez de tierra: avisos para renovar el agua, recomendaciones y tarea de limpieza.
   Lógica pura. Las recomendaciones fijas son reglas generales de cultivo en agua; las de cada especie se piden a Gemini. */
import { makeTask } from './novedad.js';
import { addDays, dateStr } from './logic.js';
import { seasonOf } from './ai.js';

/** Suculentas y cactus: en agua suelen pudrirse. */
export const SUCCULENT = /aloe|echeveria|crassula|cact|opuntia|haworthia|lampranthus|sedum|sempervivum|graptopetalum|kalanchoe|jade|rosa de piedra|tuna|nopal|sabila|alicoche|rayito/i;
const EASY = /epipremnum|pothos|poto|philodendron|filodendro|monstera|tradescantia|chlorophytum|cinta|mala madre|coleus|plectranthus|hedera|hiedra|syngonium|colocasia|lucky|bambu|bambú|menta|albahaca|ocimum|mentha/i;
const SANSEVIERIA = /sansevieria|trifasciata|lengua de suegra|espada de san jorge/i;

/** Cada cuántos días renovar el agua según la temperatura media (más calor, antes se pone mala). */
export function waterRenewDays(avgTemp) {
  if (!Number.isFinite(avgTemp)) return 7;
  if (avgTemp >= 28) return 4;
  if (avgTemp >= 24) return 5;
  if (avgTemp >= 18) return 7;
  if (avgTemp >= 12) return 9;
  return 12;
}

export const WATER_TIPS = [
  'Cambiá toda el agua en cada aviso (no solo rellenar). Si se pone turbia, verdosa o huele mal, cambiala antes.',
  'Usá agua a temperatura ambiente: reposada 24 h (así se evapora el cloro), filtrada o de lluvia.',
  'Solo las raíces y la base del tallo van en el agua. Las hojas sumergidas se pudren y ensucian todo.',
  'Luz brillante sin sol directo sobre el frasco: el sol calienta el agua y genera algas. Un frasco opaco o forrado por fuera ayuda.',
  'Al renovar el agua, enjuagá suavemente las raíces y lavá el frasco con agua tibia (sin detergente fuerte).',
  'Entre cambios podés rellenar lo que se evapore con agua del mismo tipo.',
  'Sin nutrientes, con los meses las hojas nuevas salen más chicas o amarillas: una gota de fertilizante líquido (o un cuarto de la dosis) cada 3 o 4 semanas, solo si está creciendo.',
];

/** Aptitud general de la especie para vivir en agua. { level: 'ok'|'cuidado'|'no'|'sin-dato', text } */
export function waterFit(plant) {
  const label = `${plant.sci || ''} ${plant.species || ''} ${plant.name || ''}`;
  if (SUCCULENT.test(label)) {
    return { level: 'no', text: 'Las suculentas y cactus casi siempre se pudren en agua. Si la tenés así, vigilá la base del tallo y pensá en pasarla a tierra.' };
  }
  if (SANSEVIERIA.test(label)) {
    return {
      level: 'cuidado',
      text: 'La lengua de suegra aguanta en agua pero crece lento y es propensa a pudrirse en la base si el agua sube sobre las hojas: mantené el nivel bajo y las hojas siempre fuera del agua. Si algún día la pasás a tierra, hacelo con raíces ya largas y regá poco al principio, porque las raíces de agua tardan en adaptarse.',
    };
  }
  if (EASY.test(label)) return { level: 'ok', text: 'Es de las plantas que mejor se adaptan a vivir en agua.' };
  return { level: 'sin-dato', text: 'No tengo datos de esta especie en agua. Probá pedirle recomendaciones a Gemini y vigilá las raíces: blancas o claras están bien, marrones y blandas indican pudrición.' };
}

/** Tarea periódica de limpieza del frasco. */
export const cleaningTask = (today = dateStr()) =>
  makeTask({
    title: 'Limpiar el frasco y las raíces',
    detail: 'Sacá la planta, lavá el frasco con agua tibia, enjuagá las raíces con suavidad y cortá las que estén marrones o blandas. Después poné agua nueva.',
    due: addDays(today, 28),
    every: 28,
    source: 'agua',
  });

export function buildWaterPrompt({ plant, sci, place, climate, now = new Date() }) {
  return `Sos un experto en plantas. Tengo esta planta viviendo en agua (en un frasco), no en tierra:

- Planta: ${plant.name}${sci ? ` (${sci})` : ''}
- Ciudad: ${place?.name || 'Argentina (hemisferio sur)'}; estación actual: ${seasonOf(now, place?.lat)}${climate ? `; temperatura media de la semana ${Math.round(climate.avgTemp)} °C` : ''}
- Cambio el agua cada ${plant.everyDays} días.

Respondé SOLO con un JSON con esta forma:
{
  "apta": "si" | "con cuidado" | "no recomendable",
  "cada_dias": número entero (cada cuántos días conviene renovar el agua con este clima),
  "consejos": ["hasta 5 consejos concretos para esta especie en agua"],
  "riesgos": ["hasta 3 señales de que algo va mal y qué hacer"],
  "nutrientes": "si necesita fertilizante en el agua, cuánto y cada cuánto (una frase)",
  "paso_a_tierra": "cuándo y cómo conviene pasarla a tierra, o null si no hace falta",
  "seguridad": "alta" | "media" | "baja"
}
No inventes: si no conocés bien la especie en agua, ponelo en "seguridad": "baja".`;
}

const txt = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const list = (v, n, len = 220) => (Array.isArray(v) ? v : []).map((x) => txt(String(x), len)).filter(Boolean).slice(0, n);

/** Valida la respuesta de Gemini sobre el cultivo en agua. Devuelve el objeto o null. */
export function parseWater(raw) {
  let j;
  try {
    const t = String(raw).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const dias = Math.round(Number(j.cada_dias));
  const apta = ['si', 'con cuidado', 'no recomendable'].includes(String(j.apta).toLowerCase()) ? String(j.apta).toLowerCase() : 'con cuidado';
  const out = {
    apta,
    dias: Number.isFinite(dias) ? Math.max(2, Math.min(30, dias)) : null,
    consejos: list(j.consejos, 5),
    riesgos: list(j.riesgos, 3),
    nutrientes: txt(j.nutrientes, 200),
    pasoATierra: j.paso_a_tierra ? txt(j.paso_a_tierra, 300) : '',
    confianza: ['alta', 'media', 'baja'].includes(j.seguridad) ? j.seguridad : 'media',
    at: new Date().toISOString(),
  };
  return out.consejos.length || out.riesgos.length || out.nutrientes ? out : null;
}
