import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('lugares de la casa y plantas en agua', async () => {
  window.scrollTo = () => {};
  window.confirm = () => true;
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const base = { photo: '', everyDays: 7, lastWatered: '2026-11-01', history: [], placement: 'interior-luz' };
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [
      { ...base, id: 'a', nid: 1, name: 'Áloe chica', species: 'Aloe vera', sci: 'Aloe vera', zone: 'baja' },
      { ...base, id: 'b', nid: 2, name: 'Sin lugar', species: 'Aloe vera', sci: 'Aloe vera' },
    ],
    nextNid: 3,
    keys: { gemini: 'G', geminiModel: 'gemini-x' },
  }));
  const asked = [];
  globalThis.fetch = vi.fn(async (url, o) => {
    asked.push([String(url), o?.body]);
    if (String(url).includes('generateContent')) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ apta: 'con cuidado', cada_dias: 5, consejos: ['Poné el frasco con luz suave'], riesgos: ['Raíces marrones'], nutrientes: 'una gota al mes', paso_a_tierra: null, seguridad: 'media' }) }] } }] }));
    }
    return new Response('{}', { status: 404 });
  });
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(80);
  const app = document.getElementById('app');

  // aviso de plantas sin lugar y "conviene moverla"
  expect(app.textContent).toContain('1 planta sin lugar definido');
  expect(app.textContent).toContain('Conviene moverla');
  app.querySelector('[data-action="lugares"]').click(); await wait();
  expect(app.textContent).toContain('Conviene mover');
  expect(app.textContent).toContain('Áloe chica → Patio · centro e izquierda');
  expect(app.textContent).toContain('Le falta luz');

  // asigno lugar a la que no tenía
  const sel = app.querySelector('[data-zone-sel="b"]');
  sel.value = 'patio-sol';
  sel.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  let s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.plants.find((p) => p.id === 'b').zone).toBe('patio-sol');
  expect(s.plants.find((p) => p.id === 'b').placement).toBe('jardin');
  expect(app.textContent).toContain('Está bien ubicada');

  // edito un lugar: el patio pasa a "afuera, poca luz" y la planta lo siente
  const inp = app.querySelector('[data-zid="patio-sol"][data-zf="name"]');
  inp.value = 'Patio grande';
  inp.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.zones.find((z) => z.id === 'patio-sol').name).toBe('Patio grande');

  // planta nueva en agua
  location.hash = '#/new'; await wait();
  app.querySelector('[data-action="medium"][data-id="agua"]').click(); await wait();
  expect(app.textContent).toContain('Renovar el agua cada');
  expect(app.textContent).toContain('Cambiá toda el agua');
  const sp = document.getElementById('f-species');
  sp.value = 'Lengua de suegra'; sp.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  expect(app.textContent).toContain('crece lento');
  document.getElementById('f-name').value = 'Lengua en agua';
  app.querySelector('[data-action="zone-pick"][data-id="baja"]').click(); await wait();
  document.getElementById('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await wait(120);
  s = JSON.parse(localStorage.getItem('plantas.v1'));
  const w = s.plants.find((p) => p.name === 'Lengua en agua');
  expect(w.water).toBe(true);
  expect(w.zone).toBe('baja');
  expect(w.auto).toBe(false);
  expect(w.tasks[0].title).toContain('Limpiar el frasco');
  expect(app.textContent).toContain('Renovar el agua');

  // ficha: avisos de agua y recomendaciones de Gemini
  app.querySelector(`[data-action="open"][data-id="${w.id}"]`).click(); await wait();
  expect(app.textContent).toContain('Ya renové el agua');
  expect(app.textContent).toContain('Próximo cambio');
  expect(app.textContent).toContain('Cultivo en agua');
  app.querySelector('[data-action="ask-water"]').click(); await wait(150);
  expect(app.textContent).toContain('Poné el frasco con luz suave');
  expect(app.textContent).toContain('Sugiere renovar el agua cada 5 días');
  app.querySelector('[data-action="water"]').click(); await wait();
  s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.plants.find((p) => p.id === w.id).history[0].type).toBe('riego');
  expect(app.textContent).toContain('Cambio de agua');
  expect(JSON.stringify(s.zones)).toContain('Patio grande');
});
