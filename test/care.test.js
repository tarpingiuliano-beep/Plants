import test from 'node:test';
import assert from 'node:assert/strict';
import { lookup, searchSpecies, advice, placementOf, PLACEMENTS } from '../src/species.js';
import { adjustedDays, summarizeClimate, buildColdAlerts } from '../src/logic.js';
import { parsePlantNet, identifyPlant, testKey, dataUrlToBlob } from '../src/net.js';

test('lookup: especie exacta, género, familia y genérico', () => {
  assert.equal(lookup('Monstera deliciosa').source, 'especie');
  assert.equal(lookup('Monstera deliciosa').days, 8);
  assert.equal(lookup('Philodendron bipinnatifidum').source, 'género');
  assert.equal(lookup('Mammillaria elongata', 'Mammillaria', 'Cactaceae').source, 'familia');
  assert.equal(lookup('Mammillaria elongata', 'Mammillaria', 'Cactaceae').days, 21);
  const g = lookup('Planta inventada', '', 'Familiaquenoexiste');
  assert.equal(g.source, 'genérico');
  assert.equal(g.generic, true);
});

test('lookup: sinónimos y mayúsculas/acentos', () => {
  assert.equal(lookup('Sansevieria trifasciata').source, 'género');
  assert.equal(lookup('DRACAENA TRIFASCIATA').source, 'especie');
  assert.equal(lookup('Salvia rosmarinus').days, 8);
});

test('búsqueda offline por nombre común sin acentos', () => {
  assert.equal(searchSpecies('costilla de adan')[0].sci, 'monstera deliciosa');
  assert.equal(searchSpecies('lengua de suegra')[0].sci, 'dracaena trifasciata');
  assert.deepEqual(searchSpecies('zzzz'), []);
});

test('riego ajustado por clima y lugar', () => {
  const [poca, luz, balcon, jardin] = PLACEMENTS;
  // 22 °C, interior luminoso: queda en el valor base
  assert.equal(adjustedDays(8, luz, 22), 8);
  // El frío alarga el intervalo más afuera que adentro (comparado con el mismo lugar en un día templado)
  const ratio = (pl) => adjustedDays(8, pl, 6) / adjustedDays(8, pl, 22);
  assert.ok(ratio(jardin) > ratio(luz));
  // Y afuera, a pleno sol, se seca antes que adentro con el mismo clima
  assert.ok(adjustedDays(8, jardin, 22) < adjustedDays(8, luz, 22));
  // Verano (32 °C): se acorta
  assert.ok(adjustedDays(8, balcon, 32) < 8);
  // Poca luz seca más lento que el interior luminoso
  assert.ok(adjustedDays(8, poca, 22) > adjustedDays(8, luz, 22));
  // Sin clima: no rompe
  assert.equal(adjustedDays(8, luz, undefined), 8);
  // Límites
  assert.ok(adjustedDays(1, jardin, 40) >= 1);
  assert.ok(adjustedDays(60, jardin, 0) <= 60);
});

test('resumen de clima', () => {
  const days = [
    { date: '2026-10-15', max: 20, min: 8, rain: 0 },
    { date: '2026-10-16', max: 15, min: 2, rain: 6 },
    { date: '2026-10-17', max: 18, min: 5, rain: 0 },
    { date: '2026-10-18', max: 22, min: 10, rain: 0 },
  ];
  const s = summarizeClimate(days, 123);
  assert.equal(s.minNext3, 2);
  assert.equal(s.minDate, '2026-10-16');
  assert.equal(s.rainTomorrow, 6);
  assert.equal(s.avgTemp, 12.5);
  assert.equal(summarizeClimate([]), null);
});

test('alertas de frío: solo plantas de afuera que no lo toleran', () => {
  const climate = summarizeClimate([
    { date: '2026-10-16', max: 15, min: 1, rain: 0 },
    { date: '2026-10-17', max: 18, min: 9, rain: 0 },
    { date: '2026-10-18', max: 18, min: 9, rain: 0 },
  ]);
  const plants = [
    { id: 'a', name: 'Albahaca', placement: 'jardin' },
    { id: 'b', name: 'Lavanda', placement: 'jardin' },
    { id: 'c', name: 'Monstera', placement: 'interior-luz' },
  ];
  const care = { a: { minTemp: 10 }, b: { minTemp: -10 }, c: { minTemp: 12 } };
  const now = new Date(2026, 9, 15, 10, 0);
  const out = buildColdAlerts(plants, climate, (p) => care[p.id], placementOf, now);
  assert.equal(out.length, 1);
  assert.match(out[0].body, /Albahaca/);
  assert.doesNotMatch(out[0].body, /Lavanda|Monstera/);
  assert.equal(out[0].at.getHours(), 19);
  assert.equal(out[0].id, 900001);
});

test('consejos según lugar', () => {
  const cactus = lookup('Opuntia ficus-indica');
  assert.ok(advice(cactus, placementOf('interior-poca')).some((t) => /más luz/.test(t)));
  const albahaca = lookup('Ocimum basilicum');
  assert.ok(advice(albahaca, placementOf('jardin')).some((t) => /frío/.test(t)));
  const helecho = lookup('Nephrolepis exaltata');
  assert.ok(advice(helecho, placementOf('interior-luz')).some((t) => /humedad/.test(t)));
});

test('PlantNet: parseo de respuesta', () => {
  const r = parsePlantNet({
    results: [
      {
        score: 0.87,
        species: {
          scientificNameWithoutAuthor: 'Monstera deliciosa',
          commonNames: ['Costilla de Adán'],
          genus: { scientificNameWithoutAuthor: 'Monstera' },
          family: { scientificNameWithoutAuthor: 'Araceae' },
        },
      },
    ],
  });
  assert.deepEqual(r[0], {
    sci: 'Monstera deliciosa',
    common: 'Costilla de Adán',
    genus: 'Monstera',
    family: 'Araceae',
    score: 0.87,
  });
});

test('PlantNet: manejo de errores HTTP', async () => {
  const realFetch = globalThis.fetch;
  const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const mock = (status, body = {}) => async (url, opts) =>
    String(url).startsWith('data:') ? realFetch(url, opts) : new Response(JSON.stringify(body), { status });
  try {
    globalThis.fetch = mock(404);
    assert.deepEqual(await identifyPlant(photo, 'k'), []);
    globalThis.fetch = mock(401, { statusCode: 401, message: 'Missing or invalid API key' });
    await assert.rejects(identifyPlant(photo, 'k'), /401.*Missing or invalid API key/);
    globalThis.fetch = mock(403, { message: 'Origin not allowed' });
    await assert.rejects(identifyPlant(photo, 'k'), /403.*Origin not allowed/);
    globalThis.fetch = mock(500);
    await assert.rejects(identifyPlant(photo, 'k'), /error 500/);
    globalThis.fetch = mock(401, { message: 'bad key' });
    assert.deepEqual(await testKey('k'), { ok: false, status: 401, msg: 'bad key' });
    globalThis.fetch = mock(200, []);
    assert.equal((await testKey('k')).ok, true);
    globalThis.fetch = mock(429);
    await assert.rejects(identifyPlant(photo, 'k'), /límite/);
    globalThis.fetch = mock(200, { results: [{ score: 0.5, species: { scientificNameWithoutAuthor: 'Aloe vera' } }] });
    assert.equal((await identifyPlant(photo, 'k'))[0].sci, 'Aloe vera');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('data URL -> Blob conserva tipo y bytes', async () => {
  const b = dataUrlToBlob('data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(b.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await b.arrayBuffer())], [255, 216, 255, 224, 0, 16]);
});

test('la subida a PlantNet va como multipart con la foto como archivo', async () => {
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, opts) => {
    sent = { url: String(url), body: opts.body, method: opts.method };
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  try {
    await identifyPlant('data:image/jpeg;base64,/9j/4AAQ', 'MI-CLAVE');
    assert.equal(sent.method, 'POST');
    assert.match(sent.url, /api-key=MI-CLAVE/);
    const f = sent.body.get('images');
    assert.equal(f.name, 'foto.jpg');
    assert.equal(f.type, 'image/jpeg');
    assert.equal(sent.body.get('organs'), 'auto');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('Impatiens hawkeri: riego frecuente (antes caía en el genérico de ~7 días)', () => {
  const c = lookup('Impatiens hawkeri', 'Impatiens', 'Balsaminaceae');
  assert.equal(c.source, 'género');
  assert.equal(c.days, 3);
  assert.equal(lookup('Impatiens walleriana').days, 3);
  assert.equal(lookup('Algo raro', '', 'Balsaminaceae').days, 3);
  assert.equal(searchSpecies('alegria del hogar')[0].sci, 'impatiens');
  // en interior luminoso con 22 °C no se alarga
  assert.ok(adjustedDays(3, placementOf('interior-luz'), 22) <= 3);
});

import { projectDue, buildHeatAlerts, nextDue } from '../src/logic.js';

const flat = (t, n = 16, rain = 0, start = '2026-10-15') => ({
  avgTemp: t,
  days: Array.from({ length: n }, (_, i) => {
    const d = new Date(2026, 9, 15 + i);
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, max: t + 4, min: t - 4, rain };
  }),
});

test('pronóstico día por día: con clima constante coincide con el intervalo ajustado', () => {
  for (const pl of PLACEMENTS) {
    for (const [base, t] of [[8, 22], [8, 12], [3, 28], [18, 5], [5, 33]]) {
      const plant = { lastWatered: '2026-10-14', baseDays: base, everyDays: adjustedDays(base, pl, t) };
      const due = projectDue(plant, pl, flat(t, 40));
      const days = Math.round((new Date(due) - new Date('2026-10-14')) / 86400000);
      assert.ok(Math.abs(days - plant.everyDays) <= 1, `${pl.id} base ${base} t ${t}: ${days} vs ${plant.everyDays}`);
    }
  }
});

test('una ola de calor adelanta el riego y el frío lo atrasa', () => {
  const pl = placementOf('jardin');
  const plant = { lastWatered: '2026-10-15', baseDays: 6, everyDays: 6 };
  const normal = projectDue(plant, pl, flat(22, 16));
  const hot = flat(22, 16);
  hot.days.forEach((d, i) => { if (i >= 1 && i <= 5) { d.max = 38; d.min = 26; } });
  const cold = flat(22, 16);
  cold.days.forEach((d, i) => { if (i >= 1 && i <= 5) { d.max = 8; d.min = 1; } });
  assert.ok(projectDue(plant, pl, hot) < normal);
  assert.ok(projectDue(plant, pl, cold) > normal);
});

test('lluvia fuerte cuenta como riego solo afuera a cielo abierto', () => {
  const plant = { lastWatered: '2026-10-15', baseDays: 6, everyDays: 6 };
  const rainy = flat(22, 16);
  rainy.days[3].rain = 20;
  const dryDue = projectDue(plant, placementOf('jardin'), flat(22, 16));
  assert.ok(projectDue(plant, placementOf('jardin'), rainy) > dryDue);
  assert.equal(projectDue(plant, placementOf('interior-luz'), rainy), projectDue(plant, placementOf('interior-luz'), flat(22, 16)));
  assert.equal(projectDue(plant, placementOf('balcon'), rainy), projectDue(plant, placementOf('balcon'), flat(22, 16)));
});

test('nextDue usa la proyección solo si es del último riego', () => {
  const p = { auto: true, lastWatered: '2026-10-15', everyDays: 5, projDue: '2026-10-18', projFor: '2026-10-15' };
  assert.equal(nextDue(p), '2026-10-18');
  assert.equal(nextDue({ ...p, lastWatered: '2026-10-16' }), '2026-10-21');
  assert.equal(nextDue({ ...p, auto: false }), '2026-10-20');
});

test('alertas de calor: solo afuera, con umbral por especie', () => {
  const climate = flat(30, 7);
  climate.days[2].max = 38;
  climate.days[3].max = 34;
  const plants = [
    { id: 'a', name: 'Tomate', placement: 'jardin' },
    { id: 'b', name: 'Helecho', placement: 'jardin' },
    { id: 'c', name: 'Monstera', placement: 'interior-luz' },
  ];
  const care = { a: {}, b: { maxTemp: 33 }, c: { maxTemp: 20 } };
  const out = buildHeatAlerts(plants, climate, (p) => care[p.id], placementOf, new Date(2026, 9, 15, 7, 0));
  const byId = Object.fromEntries(out.map((o) => [o.id, o]));
  assert.match(byId[900103].body, /Tomate, Helecho/);
  assert.match(byId[900104].body, /Helecho/);
  assert.doesNotMatch(byId[900104].body, /Tomate/);
  assert.ok(out.every((o) => !/Monstera/.test(o.body)));
  assert.equal(byId[900103].at.getHours(), 8);
});

import { calibrate, tagLastWatering, waterPlant } from '../src/logic.js';

test('calibración: aprende de la tierra, con límites y sin tocar nada si "se veía mal"', () => {
  let p = { calib: 1, calibN: 0 };
  // tierra húmeda a tiempo: necesita más días entre riegos
  const a = calibrate(p, 'humeda', 0);
  assert.equal(a.calib, 1.12);
  assert.equal(a.calibN, 1);
  // tierra seca a tiempo: menos días
  assert.equal(calibrate(p, 'seca', 0).calib, 0.88);
  // lo esperable casi no mueve nada
  assert.equal(calibrate(p, 'humeda', -3).calib, 1.05); // la regó antes de tiempo
  assert.equal(calibrate(p, 'seca', 3).calib, 0.95); // la regó tarde
  // lo contrario sí pesa más
  assert.equal(calibrate(p, 'seca', -3).calib, 0.8);
  assert.equal(calibrate(p, 'humeda', 3).calib, 1.2);
  // justa suma experiencia pero no cambia el ritmo
  assert.deepEqual(calibrate({ calib: 1.3, calibN: 2 }, 'justa', 0), { calib: 1.3, calibN: 3 });
  // "se veía mal" no calibra
  assert.deepEqual(calibrate({ calib: 1.3, calibN: 2 }, 'mal', -4), { calib: 1.3, calibN: 2 });
  // límites
  let q = { calib: 1.75, calibN: 9 };
  assert.equal(calibrate(q, 'humeda', 3).calib, 1.8);
  q = { calib: 0.52, calibN: 9 };
  assert.equal(calibrate(q, 'seca', -3).calib, 0.5);
});

test('el riego guarda cómo estaba la tierra', () => {
  const p = waterPlant({ history: [], lastWatered: '2026-10-01' }, new Date(2026, 9, 25, 10));
  const t = tagLastWatering(p, 'seca');
  assert.equal(t.history[0].soil, 'seca');
  assert.equal(tagLastWatering({ history: [{ type: 'nota' }] }, 'seca').history[0].soil, undefined);
});

import { buildStormAlerts, stormOf } from '../src/logic.js';

test('tormentas: granizo, tormenta y viento, con aviso la noche anterior', () => {
  assert.equal(stormOf({ code: 96 }), 'granizo');
  assert.equal(stormOf({ code: 95 }), 'tormenta');
  assert.equal(stormOf({ code: 3, gust: 72 }), 'viento');
  assert.equal(stormOf({ code: 3, gust: 40 }), null);
  const climate = flat(24, 7);
  climate.days[2].code = 96;
  climate.days[2].gust = 70;
  climate.days[4].gust = 65;
  const plants = [
    { id: 'a', name: 'Tomate', placement: 'jardin' },
    { id: 'b', name: 'Monstera', placement: 'interior-luz' },
  ];
  const now = new Date(2026, 9, 15, 10, 0);
  const out = buildStormAlerts(plants, climate, placementOf, now);
  const byId = Object.fromEntries(out.map((o) => [o.id, o]));
  assert.match(byId[900205].title, /granizo mañana/i); // día 2: aviso a las 20:00 del día 1
  assert.equal(byId[900205].at.getHours(), 20);
  assert.match(byId[900206].title, /granizo hoy/i);
  assert.equal(byId[900206].at.getHours(), 8);
  assert.match(byId[900206].body, /70 km\/h/);
  assert.match(byId[900206].body, /Tomate/);
  assert.doesNotMatch(byId[900206].body, /Monstera/);
  assert.match(byId[900209].title, /Viento fuerte mañana/);
  assert.equal(new Set(out.map((o) => o.id)).size, out.length);
  assert.deepEqual(buildStormAlerts([plants[1]], climate, placementOf, now), []);
});
