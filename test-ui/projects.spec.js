import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();

test('proyecto desde plantilla: crear con avisos, diario y tarea hecha', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  localStorage.setItem('plantas.v1', JSON.stringify({ plants: [], nextNid: 1, settings: { hour: 9, minute: 0 } }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');

  expect(app.textContent).toContain('Proyectos');
  click('[data-action="pj-new"]'); await wait();
  expect(location.hash).toBe('#/proyecto/nuevo');
  click('[data-action="pj-pick"][data-id="estratificacion"]'); await wait();
  expect(document.getElementById('pj-name').value).toBe('Perales de semilla');
  document.getElementById('pj-bonsai').checked = true;
  const d = new Date(); d.setDate(d.getDate() - 10);
  document.getElementById('pj-start').value = d.toISOString().slice(0, 10);
  click('[data-action="pj-plan"]'); await wait();
  expect(app.textContent).toContain('plantilla general de la app');
  expect(app.textContent).toContain('Armar la bolsa en la heladera');
  // la etapa del día 0 ya pasó: viene sin tildar y deshabilitada
  const first = document.querySelector('.pj-chk[data-i="0"]');
  expect(first.checked).toBe(false);
  expect(first.disabled).toBe(true);
  click('[data-action="pj-create"]'); await wait();
  expect(location.hash).toMatch(/^#\/proyecto\/j/);
  expect(app.textContent).toContain('Día 10');
  expect(app.textContent).toContain('Tareas pendientes');
  const tid = document.querySelector('[data-action="task-done"]').dataset.tid;
  expect(tid).toBeTruthy();

  document.getElementById('pj-note').value = 'las semillas se ven bien';
  click('[data-action="pj-log"]'); await wait();
  expect(app.textContent).toContain('las semillas se ven bien');
  click('[data-action="task-done"]'); await wait();
  expect(app.textContent).toContain('✓ Revisar humedad y moho');

  location.hash = '#/'; await wait();
  expect(app.textContent).toContain('Perales de semilla');
});
