import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('temporada: pide la ficha a Gemini, muestra lo de este mes, calendario y recordatorio de abono', async () => {
  window.scrollTo = () => {};
  const now = new Date();
  const m = now.getMonth() + 1;
  const today = `${now.getFullYear()}-${String(m).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const calls = [];
  const extraJson = {
    abono: { meses: [m], cada_dias: 21, con_lo_que_tengo: 'Una cucharada de humus por maceta', detalle: '' },
    poda: null, trasplante: null,
    reproduccion: {
      metodos: [{ tipo: 'esqueje', meses: [m], pasos: ['Cortá un tallo de 10 cm', 'Ponelo en agua'] }],
      semillas: { meses_cosecha: [m], como_extraerlas: ['Esperá a que la cápsula se seque', 'Abrila y guardá las semillas'] },
    },
    plagas: ['Pulgón: revisá el envés de las hojas'],
    seguridad: 'alta',
  };
  globalThis.fetch = vi.fn(async (url, opts) => {
    const u = String(url);
    calls.push({ u, body: opts?.body });
    if (u.includes(':generateContent')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(extraJson) }] } }] }));
    if (u.includes('/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }));
    return new Response('{}', { status: 404 });
  });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [{ id: 'a', nid: 1, name: 'Impatiens', sci: 'Impatiens hawkeri', placement: 'interior-luz', photo: '', auto: true, baseDays: 3, everyDays: 3, lastWatered: today, history: [] }],
    species: { 'Impatiens hawkeri': { sci: 'Impatiens hawkeri', names: [], wiki: 'x', care: { sci: 'x', names: [], days: 3, light: 2, minTemp: 10, humidity: 'media', outdoorOk: true, tips: [], source: 'especie', generic: false } } },
    nextNid: 2, keys: { plantnet: '', gemini: 'GK', geminiModel: 'gemini-2.5-flash' }, settings: { hour: 9, minute: 0, myFertilizer: 'humus de lombriz' },
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(300);
  const app = document.getElementById('app');

  const gen = calls.find((c) => c.u.includes(':generateContent') && c.body.includes('ficha de temporada'));
  expect(gen.body).toContain('humus de lombriz');
  expect(gen.body).toContain('Impatiens hawkeri');
  expect(app.textContent).toContain('Este mes: Abonar: Impatiens');

  location.hash = '#/p/a'; await wait();
  expect(app.textContent).toContain('Cuidados de temporada');
  expect(app.textContent).toContain('Una cucharada de humus por maceta');
  expect(app.textContent).toContain('Hacer esquejes');
  expect(app.textContent).toContain('Cosechar semillas');
  expect(app.textContent).toContain('Esperá a que la cápsula se seque');
  expect(app.textContent).toContain('Pulgón');

  document.querySelector('[data-action="abono-task"]').click(); await wait();
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  const t = s.plants[0].tasks[0];
  expect(t.title).toBe('Abonar Impatiens');
  expect(t.every).toBe(21);
  expect(t.months).toEqual([m]);
  expect(t.source).toBe('abono');

  location.hash = '#/calendario'; await wait();
  expect(app.textContent).toContain('este mes');
  expect(app.querySelector('.ev a').textContent).toBe('Impatiens');

  // no vuelve a preguntar la ficha
  const n = calls.filter((c) => c.u.includes(':generateContent')).length;
  window.dispatchEvent(new Event('online')); await wait(100);
  expect(calls.filter((c) => c.u.includes(':generateContent')).length).toBe(n);
});
