import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('si Gemini falla al crear un proyecto: muestra el motivo y deja seguir a mano; foto desde una tarea', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [], nextNid: 1, keys: { gemini: 'G', geminiModel: 'gemini-x' },
    projects: [{ id: 'j1', name: 'Tomates', icon: '🍅', startDate: today, log: [], done: false,
      plan: { resumen: '', diagnostico: '', materiales: [], consejos: [], alertas: [], etapas: [{ dia: 0, titulo: 'Control', detalle: 'Sacale una foto' }], source: 'Claude', confidence: 'media' },
      tasks: [{ id: 't1', title: 'Control del hongo', detail: 'Mandame una foto', due: today, time: '09:00', every: null, left: null, source: 'proyecto' }] }],
  }));
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(60);
  const app = document.getElementById('app');

  // falla Gemini → motivo + botón para seguir a mano
  location.hash = '#/proyecto/nuevo'; await wait(60);
  click('[data-action="pj-pick"][data-id="custom"]'); await wait();
  document.getElementById('pj-name').value = 'Mi huerta';
  document.getElementById('pj-desc').value = 'quiero armar una huerta';
  click('[data-action="pj-plan"]'); await wait(150);
  expect(app.textContent).toContain('error 400');
  expect(app.textContent).toContain('API key not valid');
  click('[data-action="pj-manual"]'); await wait();
  expect(app.textContent).toContain('Llevalo a Gemini');
  expect(document.getElementById('pj-raw')).toBeTruthy();

  // foto desde una tarea de proyecto
  location.hash = '#/proyecto/j1'; await wait(80);
  expect(app.querySelector('[data-action="pj-task-photo"]')).toBeTruthy();
  click('[data-action="pj-task-photo"]'); await wait();
  const input = document.getElementById('pj-task-photo-input');
  const file = new File([Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))], 'a.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true })); await wait(120);
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  const j = s.projects.find((x) => x.id === 'j1');
  expect(j.log.length).toBe(1);
  expect(j.log[0].photo).toMatch(/^data:image/);
  expect(j.log[0].text).toContain('Control del hongo');
  expect(j.tasks.length).toBe(1); // no se marca como hecha
});
