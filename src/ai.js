/* Cuidados de una especie consultados a Gemini (API directa). Solo se envía el nombre de la especie,
   dónde está la planta y el clima general: nunca fotos ni datos personales. */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const HUMIDITY = ['baja', 'media', 'alta'];

/** Elige el modelo "flash" estable más nuevo de la lista que devuelve Google. */
export function pickModel(list) {
  const ok = (list || []).filter(
    (m) => (m.supportedGenerationMethods || []).includes('generateContent') && /^models\/gemini-[\d.]+-flash(-lite)?$/.test(m.name || ''),
  );
  const ver = (m) => parseFloat(/gemini-([\d.]+)-flash/.exec(m.name)[1]);
  ok.sort((a, b) => ver(b) - ver(a) || (a.name.endsWith('-lite') ? 1 : 0) - (b.name.endsWith('-lite') ? 1 : 0));
  return ok[0]?.name.replace('models/', '') || '';
}

export function seasonOf(date, lat) {
  const m = date.getMonth() + 1;
  const north = ['invierno', 'invierno', 'primavera', 'primavera', 'primavera', 'verano', 'verano', 'verano', 'otoño', 'otoño', 'otoño', 'invierno'][m - 1];
  if (!(lat < 0)) return north;
  return { invierno: 'verano', verano: 'invierno', primavera: 'otoño', otoño: 'primavera' }[north];
}

export function buildCarePrompt({ sci, commonName, family, placement, place, climate, now = new Date() }) {
  return `Sos un experto en jardinería. Necesito los cuidados base de esta planta:

- Especie: ${sci}${commonName ? ` (${commonName})` : ''}${family ? `, familia ${family}` : ''}
- La tengo en: ${placement?.label || 'interior luminoso'}
- Ciudad: ${place?.name || 'sin dato'}; estación actual: ${seasonOf(now, place?.lat)}${climate ? `; temperatura media de la semana ${Math.round(climate.avgTemp)} °C` : ''}

Respondé SOLO con un JSON con esta forma:
{
  "riego_dias": número entero,
  "luz": número del 1 al 4,
  "temp_minima_c": número,
  "temp_maxima_c": número,
  "humedad": "baja" | "media" | "alta",
  "apta_exterior": true | false,
  "consejos": ["hasta 3 consejos cortos y concretos"],
  "seguridad": "alta" | "media" | "baja"
}
Reglas: "riego_dias" es cada cuántos días regar una planta de esta especie en una maceta con drenaje, en un interior luminoso a unos 22 °C (el ajuste por estación y clima lo hace mi app, no lo incluyas). Si la especie necesita la tierra siempre húmeda, el número debe ser chico (2 a 4). "luz": 1 tolera poca luz, 2 luz brillante sin sol directo, 3 mucha luz con algo de sol, 4 sol directo. "temp_minima_c" es la temperatura más baja que aguanta sin daño y "temp_maxima_c" la más alta que aguanta a pleno aire libre antes de sufrir (por ejemplo, 38). Si no conocés bien la especie, ponelo en "seguridad": "baja" y no inventes.`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Valida la respuesta de la IA. Devuelve un objeto "care" o null. */
export function parseCare(text, sci, names = []) {
  let j;
  try {
    const t = String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const days = Math.round(Number(j.riego_dias));
  const light = Number(j.luz);
  const minTemp = Number(j.temp_minima_c);
  if (!Number.isFinite(days) || days < 1 || !Number.isFinite(light) || !Number.isFinite(minTemp)) return null;
  return {
    sci,
    names,
    days: clamp(days, 1, 45),
    light: clamp(light, 1, 4),
    minTemp: clamp(Math.round(minTemp), -20, 20),
    maxTemp: Number.isFinite(Number(j.temp_maxima_c)) && j.temp_maxima_c !== null ? clamp(Math.round(Number(j.temp_maxima_c)), 20, 50) : undefined,
    humidity: HUMIDITY.includes(j.humedad) ? j.humedad : 'media',
    outdoorOk: j.apta_exterior === true,
    tips: (Array.isArray(j.consejos) ? j.consejos : []).map((x) => String(x).trim().slice(0, 160)).filter(Boolean).slice(0, 3),
    source: 'IA',
    generic: false,
    confidence: ['alta', 'media', 'baja'].includes(j.seguridad) ? j.seguridad : 'media',
  };
}

async function errMsg(res) {
  try {
    const j = JSON.parse(await res.text());
    return String(j.error?.message || '').slice(0, 140);
  } catch {
    return '';
  }
}

/** Prueba la clave y elige el modelo. { ok, model, status, msg } */
export async function testGeminiKey(key) {
  try {
    const res = await fetch(`${BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': key } });
    if (!res.ok) return { ok: false, status: res.status, msg: await errMsg(res) };
    const model = pickModel((await res.json()).models);
    return model ? { ok: true, model } : { ok: false, status: 200, msg: 'No encontré un modelo disponible con esta clave.' };
  } catch {
    return { ok: false, status: 0, msg: 'No pude conectarme con Google.' };
  }
}

/** Pide los cuidados de una especie. Devuelve { care } o { error, quota }. */
export async function askCare(ctx, key, model) {
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildCarePrompt(ctx) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
    if (res.status === 429) return { error: 'Llegaste al límite gratuito de Gemini. Se reintenta más tarde.', quota: true };
    if (!res.ok) {
      const m = await errMsg(res);
      return { error: `Gemini respondió error ${res.status}${m ? `: ${m}` : ''}` };
    }
    const j = await res.json();
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const care = parseCare(text, ctx.sci, ctx.commonName ? [ctx.commonName] : []);
    return care ? { care } : { error: 'No pude leer la respuesta de Gemini.' };
  } catch {
    return { error: 'No pude conectarme con Google.' };
  }
}

/* ---------- Ficha de temporada: abono, poda, trasplante, reproducción, plagas ---------- */

export function buildExtraPrompt({ sci, commonName, place, myFertilizer }) {
  return `Sos un experto en jardinería y propagación de plantas. Necesito la ficha de temporada de esta planta:

- Especie: ${sci}${commonName ? ` (${commonName})` : ''}
- Vivo en: ${place?.name || 'Argentina (hemisferio sur)'}. Todos los meses que me des tienen que ser los de mi hemisferio (1 = enero ... 12 = diciembre).
- Abono que tengo en casa: ${myFertilizer?.trim() || 'ninguno en particular'}

Respondé SOLO con un JSON con esta forma (usá null en lo que no aplique a esta especie):
{
  "abono": { "meses": [números 1-12 en que conviene abonar], "cada_dias": número, "con_lo_que_tengo": "cuánto y cómo usar mi abono, en una oración", "detalle": "consejo corto" },
  "poda": { "meses": [números], "detalle": "cómo y cuánto podar" },
  "trasplante": { "meses": [números], "cada_meses": número, "detalle": "señales y cómo hacerlo" },
  "reproduccion": {
    "metodos": [ { "tipo": "semilla" | "esqueje" | "division" | "hijuelos" | "acodo", "meses": [números], "pasos": ["hasta 6 pasos cortos"] } ],
    "semillas": { "meses_cosecha": [números en que maduran las semillas o frutos], "como_extraerlas": ["hasta 6 pasos cortos para extraerlas, secarlas y guardarlas"] }
  },
  "plagas": ["hasta 3 plagas o enfermedades típicas y cómo prevenirlas"],
  "seguridad": "alta" | "media" | "baja"
}
Reglas: no inventes; si esta especie no se reproduce por un método, no lo pongas. Si no conocés bien la especie, ponelo en "seguridad": "baja".`;
}

const monthsOf = (v) =>
  [...new Set((Array.isArray(v) ? v : []).map((m) => Math.round(Number(m))).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
const lines = (v, n = 6, len = 200) =>
  (Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, len)).filter(Boolean).slice(0, n);
const text = (v, len = 240) => (typeof v === 'string' ? v.trim().slice(0, len) : '');
const KINDS = ['semilla', 'esqueje', 'division', 'hijuelos', 'acodo'];

/** Valida la ficha de temporada. Devuelve el objeto "extra" o null si no sirve. */
export function parseExtra(raw) {
  let j;
  try {
    const t = String(raw).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const abonoMeses = monthsOf(j.abono?.meses);
  const poda = monthsOf(j.poda?.meses);
  const trasp = monthsOf(j.trasplante?.meses);
  const metodos = (Array.isArray(j.reproduccion?.metodos) ? j.reproduccion.metodos : [])
    .map((m) => ({ tipo: KINDS.includes(m?.tipo) ? m.tipo : null, meses: monthsOf(m?.meses), pasos: lines(m?.pasos) }))
    .filter((m) => m.tipo && (m.meses.length || m.pasos.length));
  const semMeses = monthsOf(j.reproduccion?.semillas?.meses_cosecha);
  const semPasos = lines(j.reproduccion?.semillas?.como_extraerlas);
  const extra = {
    abono: abonoMeses.length
      ? {
          meses: abonoMeses,
          cadaDias: Number(j.abono.cada_dias) > 0 ? clamp(Math.round(Number(j.abono.cada_dias)), 7, 180) : null,
          conLoQueTengo: text(j.abono.con_lo_que_tengo),
          detalle: text(j.abono.detalle),
        }
      : null,
    poda: poda.length ? { meses: poda, detalle: text(j.poda.detalle) } : null,
    trasplante: trasp.length
      ? { meses: trasp, cadaMeses: Number(j.trasplante.cada_meses) > 0 ? clamp(Math.round(Number(j.trasplante.cada_meses)), 3, 120) : null, detalle: text(j.trasplante.detalle) }
      : null,
    reproduccion: { metodos, semillas: semMeses.length || semPasos.length ? { meses: semMeses, pasos: semPasos } : null },
    plagas: lines(j.plagas, 3, 160),
    confidence: ['alta', 'media', 'baja'].includes(j.seguridad) ? j.seguridad : 'media',
    fetchedAt: Date.now(),
  };
  const any = extra.abono || extra.poda || extra.trasplante || metodos.length || extra.reproduccion.semillas || extra.plagas.length;
  return any ? extra : null;
}

/** Pide la ficha de temporada. { extra } o { error, quota } */
export async function askExtra(ctx, key, model) {
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildExtraPrompt(ctx) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
    if (res.status === 429) return { error: 'Llegaste al límite gratuito de Gemini.', quota: true };
    if (!res.ok) {
      const m = await errMsg(res);
      return { error: `Gemini respondió error ${res.status}${m ? `: ${m}` : ''}` };
    }
    const j = await res.json();
    const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const extra = parseExtra(t);
    return extra ? { extra } : { error: 'No pude leer la ficha de temporada.' };
  } catch {
    return { error: 'No pude conectarme con Google.' };
  }
}
