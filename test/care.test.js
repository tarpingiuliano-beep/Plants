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
