import test from 'node:test';
import assert from 'node:assert/strict';
import { pickModel, parseCare, buildCarePrompt, seasonOf, askCare, testGeminiKey } from '../src/ai.js';

const gc = ['generateContent'];

test('elige el flash estable más nuevo', () => {
  const list = [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.0-flash', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.0-flash-lite', supportedGenerationMethods: gc },
    { name: 'models/gemini-3.5-flash-preview', supportedGenerationMethods: gc },
    { name: 'models/gemini-4.0-flash', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-3.0-pro', supportedGenerationMethods: gc },
  ];
  assert.equal(pickModel(list), 'gemini-3.0-flash');
  assert.equal(pickModel([]), '');
});

test('estación según hemisferio', () => {
  assert.equal(seasonOf(new Date(2026, 9, 17), -33.7), 'primavera');
  assert.equal(seasonOf(new Date(2026, 9, 17), 40), 'otoño');
  assert.equal(seasonOf(new Date(2026, 0, 10), -33.7), 'verano');
});

test('valida la respuesta y limita valores absurdos', () => {
  const c = parseCare('```json\n{"riego_dias":3,"luz":2.5,"temp_minima_c":10,"humedad":"media","apta_exterior":true,"consejos":["a","b","c","d"],"seguridad":"alta"}\n```', 'Impatiens hawkeri', ['Alegría']);
  assert.equal(c.days, 3);
  assert.equal(c.source, 'IA');
  assert.equal(c.tips.length, 3);
  assert.equal(c.outdoorOk, true);
  assert.equal(c.maxTemp, undefined);
  assert.equal(parseCare('{"riego_dias":3,"luz":2,"temp_minima_c":5,"temp_maxima_c":38}', 'x').maxTemp, 38);
  assert.equal(parseCare('{"riego_dias":900,"luz":9,"temp_minima_c":-90}', 'x').days, 45);
  assert.equal(parseCare('{"riego_dias":900,"luz":9,"temp_minima_c":-90}', 'x').light, 4);
  assert.equal(parseCare('{"riego_dias":900,"luz":9,"temp_minima_c":-90}', 'x').minTemp, -20);
  assert.equal(parseCare('no es json', 'x'), null);
  assert.equal(parseCare('{"riego_dias":"mucho"}', 'x'), null);
});

test('el pedido no lleva fotos ni datos personales', () => {
  const t = buildCarePrompt({ sci: 'Impatiens hawkeri', placement: { label: 'Interior luminoso' }, place: { name: 'Venado Tuerto', lat: -33.7 }, climate: { avgTemp: 18.4 }, now: new Date(2026, 9, 17) });
  assert.match(t, /Impatiens hawkeri/);
  assert.match(t, /primavera/);
  assert.match(t, /18 °C/);
});

test('askCare y testGeminiKey con respuestas simuladas', async () => {
  const real = globalThis.fetch;
  try {
    let sent;
    globalThis.fetch = async (url, opts) => {
      sent = { url: String(url), opts };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"riego_dias":3,"luz":2,"temp_minima_c":8,"humedad":"alta","apta_exterior":false,"consejos":[],"seguridad":"media"}' }] } }] }), { status: 200 });
    };
    const r = await askCare({ sci: 'Impatiens hawkeri' }, 'K', 'gemini-3.0-flash');
    assert.equal(r.care.days, 3);
    assert.match(sent.url, /models\/gemini-3.0-flash:generateContent/);
    assert.equal(sent.opts.headers['x-goog-api-key'], 'K');
    assert.ok(!sent.url.includes('K'), 'la clave no va en la URL');

    globalThis.fetch = async () => new Response('{}', { status: 429 });
    assert.equal((await askCare({ sci: 'x' }, 'K', 'm')).quota, true);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 });
    assert.match((await askCare({ sci: 'x' }, 'K', 'm')).error, /400.*API key not valid/);

    globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: gc }] }), { status: 200 });
    assert.deepEqual(await testGeminiKey('K'), { ok: true, model: 'gemini-2.5-flash' });
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 400 });
    assert.equal((await testGeminiKey('K')).ok, false);
  } finally {
    globalThis.fetch = real;
  }
});

import { parseExtra, buildExtraPrompt, askExtra } from '../src/ai.js';

test('ficha de temporada: valida meses, pasos y descarta basura', () => {
  const e = parseExtra(JSON.stringify({
    abono: { meses: [9, 10, 10, 13, 0, '11'], cada_dias: 1, con_lo_que_tengo: 'Una cucharada de humus por maceta', detalle: 'x' },
    poda: null,
    trasplante: { meses: [9], cada_meses: 24, detalle: 'Cuando salgan raíces por abajo' },
    reproduccion: {
      metodos: [
        { tipo: 'esqueje', meses: [10, 11], pasos: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
        { tipo: 'inventado', meses: [1], pasos: ['x'] },
      ],
      semillas: { meses_cosecha: [3, 4], como_extraerlas: ['Esperá a que la cápsula se seque', 'Abrila', 'Secá las semillas'] },
    },
    plagas: ['Pulgón', 'Cochinilla', 'Arañuela', 'Mosca blanca'],
    seguridad: 'ALTA',
  }));
  assert.deepEqual(e.abono.meses, [9, 10, 11]);
  assert.equal(e.abono.cadaDias, 7); // mínimo razonable
  assert.equal(e.poda, null);
  assert.equal(e.trasplante.cadaMeses, 24);
  assert.equal(e.reproduccion.metodos.length, 1);
  assert.equal(e.reproduccion.metodos[0].pasos.length, 6);
  assert.deepEqual(e.reproduccion.semillas.meses, [3, 4]);
  assert.equal(e.plagas.length, 3);
  assert.equal(e.confidence, 'media'); // 'ALTA' en mayúsculas no es válido: queda por defecto
  assert.equal(parseExtra('no json'), null);
  assert.equal(parseExtra('{"abono":{"meses":[]},"plagas":[]}'), null);
});

test('el pedido de temporada usa mi abono y mi ciudad', async () => {
  const t = buildExtraPrompt({ sci: 'Impatiens hawkeri', place: { name: 'Venado Tuerto, Santa Fe' }, myFertilizer: 'humus de lombriz' });
  assert.match(t, /humus de lombriz/);
  assert.match(t, /Venado Tuerto/);
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"poda":{"meses":[9],"detalle":"d"},"seguridad":"alta"}' }] } }] }));
    const r = await askExtra({ sci: 'x' }, 'K', 'm');
    assert.deepEqual(r.extra.poda.meses, [9]);
    assert.equal(r.extra.confidence, 'alta');
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    assert.equal((await askExtra({ sci: 'x' }, 'K', 'm')).quota, true);
  } finally {
    globalThis.fetch = real;
  }
});
