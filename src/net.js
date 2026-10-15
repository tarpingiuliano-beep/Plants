import { summarizeClimate } from './logic.js';

/* ---------- Clima (Open-Meteo, sin clave) ---------- */

export async function fetchClimate({ lat, lon }) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Clima: error ${r.status}`);
  const j = await r.json();
  const d = j.daily;
  if (!d?.time) throw new Error('Clima: respuesta inesperada');
  const days = d.time.map((date, i) => ({
    date,
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i],
  }));
  const s = summarizeClimate(days);
  if (!s) throw new Error('Clima: sin datos');
  return s;
}

export async function searchCity(q) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=es&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Búsqueda: error ${r.status}`);
  const j = await r.json();
  return (j.results || []).map((x) => ({
    name: [x.name, x.admin1, x.country].filter(Boolean).join(', '),
    lat: x.latitude,
    lon: x.longitude,
  }));
}

/* ---------- Identificación (PlantNet) ---------- */

export function parsePlantNet(json) {
  return (json.results || []).slice(0, 3).map((r) => ({
    sci: r.species?.scientificNameWithoutAuthor || '',
    common: (r.species?.commonNames || [])[0] || '',
    genus: r.species?.genus?.scientificNameWithoutAuthor || '',
    family: r.species?.family?.scientificNameWithoutAuthor || '',
    score: r.score || 0,
  }));
}

async function readError(res) {
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      return String(j.message || j.error || t).slice(0, 140);
    } catch {
      return t.slice(0, 140);
    }
  } catch {
    return '';
  }
}

const detail = (status, msg) => `(error ${status}${msg ? `: ${msg}` : ''})`;

/** Prueba la clave sin mandar ninguna foto. */
export async function testKey(apiKey) {
  try {
    const res = await fetch(`https://my-api.plantnet.org/v2/projects?api-key=${encodeURIComponent(apiKey)}`);
    if (res.ok) return { ok: true, status: res.status, msg: '' };
    return { ok: false, status: res.status, msg: await readError(res) };
  } catch {
    return { ok: false, status: 0, msg: 'No pude conectarme con PlantNet.' };
  }
}

/** data URL -> Blob sin pasar por fetch (con CapacitorHttp activo, fetch iría por la red nativa). */
export function dataUrlToBlob(dataUrl) {
  const [head, b64 = ''] = String(dataUrl).split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function identifyPlant(dataUrl, apiKey) {
  const blob = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append('images', blob, 'foto.jpg');
  form.append('organs', 'auto');
  const url =
    'https://my-api.plantnet.org/v2/identify/all' +
    `?lang=es&nb-results=3&api-key=${encodeURIComponent(apiKey)}`;

  let res;
  try {
    res = await fetch(url, { method: 'POST', body: form });
  } catch {
    throw new Error('No pude conectarme con PlantNet. Revisá tu conexión.');
  }
  if (res.status === 404) return []; // PlantNet: no encontró ninguna especie
  if (res.status === 429) throw new Error('Llegaste al límite diario gratuito de PlantNet. Probá mañana o cargá la especie a mano.');
  if (!res.ok) {
    const d = detail(res.status, await readError(res));
    if (res.status === 401) throw new Error(`PlantNet no aceptó la clave ${d}. Usá “Probar clave” en Ajustes.`);
    if (res.status === 403) throw new Error(`PlantNet rechazó el pedido ${d}. Puede ser un permiso de la clave: usá “Probar clave” en Ajustes.`);
    throw new Error(`PlantNet respondió con un error ${d}.`);
  }
  return parsePlantNet(await res.json());
}

/* ---------- Ficha de la especie (Wikipedia, sin clave) ---------- */

export async function fetchWiki(sci) {
  const title = encodeURIComponent(String(sci).trim().replace(/\s+/g, '_'));
  for (const lang of ['es', 'en']) {
    try {
      const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.type === 'disambiguation' || !j.extract) continue;
      const text = j.extract.length > 420 ? `${j.extract.slice(0, 417).replace(/\s+\S*$/, '')}…` : j.extract;
      return { text, lang };
    } catch {
      /* sin conexión: queda pendiente */
    }
  }
  return null;
}
