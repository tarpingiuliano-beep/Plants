import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();

test('novedad general: regué con té de banana menos las suculentas → historial, riego y tareas de Gemini', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const bodies = [];
  globalThis.fetch = vi.fn(async (url, opts) => {
    bodies.push(String(opts?.body || ''));
    const out = { resumen: 'El té de banana aporta potasio; no abuses', general: 'No más de una vez por semana', plantas: [
      { id: 'a', evaluacion: 'Bien para ella', alerta: null, tareas: [{ titulo: 'Revisar hojas', detalle: 'Mirá si hay hongos', en_dias: 3 }] },
      { id: 'b', evaluacion: 'Sin cambios', tareas: [] },
      { id: 'ajena', tareas: [{ titulo: 'No debe aparecer' }] },
    ] };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) };
  });
  const old = '2026-01-01';
  const mk = (id, name) => ({ id, nid: 1, name, sci: '', species: '', placement: 'interior-luz', photo: '', everyDays: 7, lastWatered: old, history: [] });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [mk('a', 'Palmera'), mk('b', 'Helecho'), mk('suc', 'Suculenta')], nextNid: 4, settings: { hour: 7, minute: 0 },
    keys: { plantnet: '', gemini: 'k', geminiModel: 'gemini-2.5-flash' },
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  bodies.length = 0;

  click('[data-action="gn-open"]'); await wait();
  expect(location.hash).toBe('#/novedades');
  click('[data-action="gn-kind"][data-k="riego"]'); await wait();
  click('[data-action="gn-kind"][data-k="abono"]'); await wait();
  document.getElementById('gn-text').value = 'con té de banana';
  click('[data-action="gn-day"][data-d="1"]'); await wait();
  expect(document.getElementById('gn-text').value).toBe('con té de banana');
  document.querySelector('.gn-chk[data-id="suc"]').checked = false;
  click('[data-action="gn-save"]'); await wait(150);

  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  const by = Object.fromEntries(s.plants.map((p) => [p.id, p]));
  const y = new Date(); y.setDate(y.getDate() - 1);
  const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  expect(by.a.lastWatered).toBe(ys); // "ayer"
  expect(by.a.lastWatered).not.toBe(old);
  expect(by.suc.lastWatered).toBe(old);
  expect(by.suc.history.length).toBe(0);
  expect(by.a.history.some((h) => /té de banana/.test(h.note))).toBe(true);
  expect(bodies[0]).toContain('Palmera');
  expect(bodies[0]).not.toContain('Suculenta');
  expect(app.textContent).toContain('potasio');
  expect(app.textContent).toContain('Revisar hojas');
  expect(app.textContent).not.toContain('No debe aparecer');

  click('[data-action="gn-tasks"]'); await wait(80);
  const s2 = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s2.plants.find((p) => p.id === 'a').tasks.map((t) => t.title)).toEqual(['Revisar hojas']);
  expect(location.hash).toBe('#/');
});
