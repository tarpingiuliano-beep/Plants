import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('IA: una especie que mi tabla no conoce se consulta sola y actualiza el riego', async () => {
  window.scrollTo = () => {};
  const today = new Date().toISOString().slice(0, 10);
  const calls = [];
  globalThis.fetch = vi.fn(async (url, opts) => {
    const u = String(url);
    calls.push({ u, body: opts?.body });
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
    if (u.includes(':generateContent')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"riego_dias":2,"luz":2,"temp_minima_c":12,"humedad":"alta","apta_exterior":false,"consejos":["Tierra siempre húmeda"],"seguridad":"alta"}' }] } }] }));
    if (u.includes('wikipedia')) return new Response('{}', { status: 404 });
    return new Response('{}', { status: 404 });
  });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [{ id: 'a', nid: 1, name: 'Rarita', sci: 'Plantus inventus', genus: 'Plantus', family: 'Noexiste', placement: 'interior-luz', auto: true, baseDays: 7, everyDays: 7, lastWatered: today, photo: '', history: [] }],
    species: { 'Plantus inventus': { sci: 'Plantus inventus', names: [], care: { sci: 'Plantus inventus', names: [], days: 7, light: 2, minTemp: 10, humidity: 'media', outdoorOk: false, tips: [], source: 'genérico', generic: true }, wiki: 'x' } },
    nextNid: 2, keys: { plantnet: '', gemini: 'GK', geminiModel: '' },
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(300);
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.species['Plantus inventus'].care.source).toBe('IA');
  expect(s.plants[0].baseDays).toBe(2);
  expect(s.keys.geminiModel).toBe('gemini-2.5-flash');
  const gen = calls.find((c) => c.u.includes(':generateContent'));
  expect(gen.body).toContain('Plantus inventus');
  expect(gen.body).not.toMatch(/data:image|photo/);

  location.hash = '#/p/a'; await wait();
  expect(document.getElementById('app').textContent).toContain('consultado a Gemini');
  // no vuelve a preguntar
  const n = calls.filter((c) => c.u.includes(':generateContent')).length;
  window.dispatchEvent(new Event('online')); await wait(100);
  expect(calls.filter((c) => c.u.includes(':generateContent')).length).toBe(n);
});
