import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('rescatar una planta: foto + descripción → plan de Gemini con diagnóstico, y usar como base', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  globalThis.confirm = vi.fn(() => true);
  const bodies = [];
  const plan = { resumen: 'Plan de 3 semanas', diagnostico: 'Pudrición de raíz por exceso de riego', etapas: [{ dia: 0, titulo: 'Sacar y limpiar raíces', detalle: 'Cortá lo podrido', cada_dias: null, veces: null }, { dia: 7, titulo: 'Revisar', detalle: 'Mirá hojas nuevas', cada_dias: 7, veces: 3 }], seguridad: 'media' };
  globalThis.fetch = vi.fn(async (url, opts) => {
    bodies.push(String(opts?.body || ''));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }) };
  });
  localStorage.setItem('plantas.v1', JSON.stringify({ plants: [], nextNid: 1, settings: { hour: 9, minute: 0 }, keys: { plantnet: '', gemini: 'k', geminiModel: 'gemini-2.5-flash' } }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  bodies.length = 0;

  click('[data-action="pj-new"]'); await wait();
  click('[data-action="pj-pick"][data-id="rescate"]'); await wait();
  expect(app.textContent).toContain('¿Qué le pasa a la planta?');
  document.getElementById('pj-name').value = 'Rescate del ficus';
  document.getElementById('pj-desc').value = 'se le caen las hojas';
  const input = document.getElementById('pj-photos-input');
  const file = new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], 'a.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true })); await wait(80);
  expect(document.querySelectorAll('.thumb img').length).toBe(1);

  click('[data-action="pj-plan"]'); await wait(120);
  expect(globalThis.confirm).toHaveBeenCalled();
  const call = bodies.find((b) => b.includes('inline_data'));
  expect(call).toBeTruthy();
  expect(call).toContain('rescate de plantas');
  expect(app.textContent).toContain('Pudrición de raíz');
  click('[data-action="pj-create"]'); await wait(100);
  expect(location.hash).toMatch(/^#\/proyecto\/j/);
  expect(app.textContent).toContain('Estado inicial');
  expect(app.textContent).toContain('Pudrición de raíz');

  click('[data-action="pj-copy-proj"]'); await wait();
  expect(document.getElementById('pj-name').value).toBe('Rescate del ficus (2)');
});
