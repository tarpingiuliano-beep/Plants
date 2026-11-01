import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();

test('actualizar el plan de un proyecto con novedades y hora propia por tarea', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  globalThis.confirm = vi.fn(() => true);
  const bodies = [];
  const plan = { resumen: 'Cambió el diagnóstico', diagnostico: 'Falta de agua, no hongos', etapas: [{ dia: 0, titulo: 'Regar con calma', detalle: 'Regá de a poco', cada_dias: 2, veces: 3 }, { dia: 10, titulo: 'Evaluar brotes', detalle: 'Mirá la base', cada_dias: null, veces: null }], seguridad: 'alta' };
  globalThis.fetch = vi.fn(async (url, opts) => {
    bodies.push(String(opts?.body || ''));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }) };
  });
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [], nextNid: 1, settings: { hour: 7, minute: 0 },
    keys: { plantnet: '', gemini: 'k', geminiModel: 'gemini-2.5-flash' },
    projects: [{ id: 'j1', name: 'Girasol', icon: '🩺', templateId: null, description: 'marchito', startDate: today, createdAt: new Date().toISOString(), photo: '', done: false,
      plan: { resumen: 'viejo', diagnostico: 'Posible hongo', materiales: [], consejos: [], alertas: [], source: 'Gemini', confidence: 'media', etapas: [{ dia: 0, titulo: 'Fungicida', detalle: 'x', cada: null, veces: null }] },
      tasks: [{ id: 't1', title: 'Fungicida', detail: 'x', due: today, time: '09:00', every: null, left: null, source: 'proyecto' }], log: [] }],
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');

  location.hash = '#/proyecto/j1'; await wait();
  expect(app.textContent).toContain('Hora del aviso: 07:00 (general)');
  const t = document.querySelector('.t-time');
  t.value = '18:30';
  t.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  expect(app.textContent).toContain('Hora del aviso: 18:30 (propia)');
  click('[data-action="task-time-reset"]'); await wait();
  expect(app.textContent).toContain('07:00 (general)');

  click('[data-action="pj-update"]'); await wait();
  expect(app.textContent).toContain('¿Qué cambió o qué sabés ahora?');
  document.getElementById('pj-desc').value = 'Gemini dice que era falta de agua';
  bodies.length = 0;
  click('[data-action="pj-plan"]'); await wait(120);
  expect(bodies[0]).toContain('Posible hongo');
  expect(bodies[0]).toContain('falta de agua');
  expect(app.textContent).toContain('Falta de agua, no hongos');
  click('[data-action="pj-create"]'); await wait(100);
  expect(location.hash).toBe('#/proyecto/j1');
  expect(app.textContent).toContain('Falta de agua, no hongos');
  expect(app.textContent).toContain('Regar con calma');
  expect(app.textContent).not.toContain('Fungicida');
  expect(app.textContent).toContain('actualizado 1 vez');
  expect(app.textContent).toContain('Plan actualizado');
});
