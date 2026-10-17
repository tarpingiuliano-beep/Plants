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
