import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('temporada: pide la ficha a Gemini; solo muestra esquejes/semillas (sin abono) y permite empezar un proyecto', async () => {
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
  expect(gen.body).toContain('Impatiens hawkeri');
  // ya no hay avisos ni tarjeta de abono/poda/temporada mensual
  expect(app.textContent).not.toContain('Este mes:');
  expect(app.textContent).not.toContain('Abonar');

  location.hash = '#/p/a'; await wait();
  expect(app.textContent).toContain('Multiplicar esta planta');
  expect(app.textContent).toContain('Hacer esquejes');
  expect(app.textContent).toContain('Cosechar semillas');
  expect(app.textContent).toContain('ahora es temporada');
  expect(app.textContent).not.toContain('Cuidados de temporada');
  expect(app.textContent).not.toContain('humus');
  expect(document.querySelector('[data-action="abono-task"]')).toBeFalsy();

  // proyecto de esquejes a pedido, prellenado desde la planta
  document.querySelector('[data-action="multiply"][data-kind="esqueje"]').click(); await wait();
  expect(location.hash).toBe('#/proyecto/nuevo');
  expect(document.getElementById('pj-name').value).toBe('Esquejes de Impatiens');
  expect(document.getElementById('pj-desc').value).toContain('esquejes de mi Impatiens (Impatiens hawkeri)');
  expect(document.getElementById('pj-desc').value).toContain('Cortá un tallo de 10 cm');

  location.hash = '#/calendario'; await wait();
  expect(app.textContent).toContain('Hacer esquejes');
  expect(app.textContent).not.toContain('Abonar');

  // no vuelve a preguntar la ficha
  const n = calls.filter((c) => c.u.includes(':generateContent')).length;
  window.dispatchEvent(new Event('online')); await wait(100);
  expect(calls.filter((c) => c.u.includes(':generateContent')).length).toBe(n);
});
