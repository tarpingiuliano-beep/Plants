import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();

test('novedad: pegar el paso a paso que ya dio Gemini y convertirlo en tareas', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const bodies = [];
  const out = { resumen: 'Falta de agua', causa_probable: 'Riego escaso', confianza: 'alta', gravedad: 'moderada', dudas: [],
    acciones: [{ titulo: 'Regar a fondo', detalle: 'Hasta que drene', en_dias: 0 }, { titulo: 'Revisar hojas', detalle: 'Cada 3 días', en_dias: 3, repetir_cada_dias: 3, veces: 4 }] };
  globalThis.fetch = vi.fn(async (url, opts) => {
    bodies.push(String(opts?.body || ''));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) };
  });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [{ id: 'a', nid: 1, name: 'Girasol', sci: '', species: '', placement: 'interior-luz', photo: '', everyDays: 7, lastWatered: new Date().toISOString().slice(0, 10), history: [] }],
    nextNid: 2, settings: { hour: 7, minute: 0 }, keys: { plantnet: '', gemini: 'k', geminiModel: 'gemini-2.5-flash' },
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  bodies.length = 0;

  location.hash = '#/p/a'; await wait();
  click('[data-action="nov-start"]'); await wait();
  click('[data-action="nov-paste"]'); await wait();
  expect(app.textContent).toContain('Pegá el paso a paso');
  document.getElementById('nov-raw').value = 'Paso 1: regá a fondo hoy.\nPaso 2: cada 3 días revisá las hojas durante 12 días.';
  click('[data-action="nov-convert"]'); await wait(120);
  expect(bodies[0]).toContain('regá a fondo hoy');
  expect(app.textContent).toContain('Regar a fondo');
  click('[data-action="nov-save"]'); await wait(80);
  const p = JSON.parse(localStorage.getItem('plantas.v1')).plants[0];
  expect(p.tasks.length).toBe(2);
  expect(p.history[0].note).toBe('Plan recibido de Gemini');
});
