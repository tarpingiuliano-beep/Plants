import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();

test('proyecto: "Ya tengo el plan de Gemini" pega el texto, valida y crea con avisos', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  localStorage.setItem('plantas.v1', JSON.stringify({ plants: [], nextNid: 1, settings: { hour: 9, minute: 0 } }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  click('[data-action="pj-new"]'); await wait();
  expect(app.textContent).toContain('Ya tengo el plan de Gemini');
  click('[data-action="pj-paste-start"]'); await wait();
  expect(document.getElementById('pj-raw')).toBeTruthy();
  expect(document.querySelector('[data-action="pj-ph-add"]')).toBeTruthy();

  // sin nombre ni texto: avisa
  click('[data-action="pj-read"]'); await wait();
  expect(app.textContent).toContain('Ponele un nombre');
  document.getElementById('pj-name').value = 'Esquejes de prueba';
  document.getElementById('pj-raw').value = 'esto no es un plan';
  click('[data-action="pj-read"]'); await wait();
  expect(app.querySelector('.status.warn')).toBeTruthy();
  expect(document.getElementById('pj-name').value).toBe('Esquejes de prueba'); // no se pierde lo escrito

  const d = new Date(); d.setDate(d.getDate() - 2);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  document.getElementById('pj-start').value = start;
  document.getElementById('pj-raw').value = '```json\n' + JSON.stringify({
    resumen: 'Plan de prueba', diagnostico: null, materiales: ['frasco'], consejos: ['luz'], alertas: ['base negra'],
    etapas: [
      { dia: 0, titulo: 'Ubicar', detalle: 'Luz sin sol', cada_dias: null, veces: null },
      { dia: 3, titulo: 'Cambiar el agua', detalle: 'Agua limpia', cada_dias: 3, veces: 4 },
    ], seguridad: 'alta',
  }) + '\n```';
  click('[data-action="pj-read"]'); await wait();
  expect(app.textContent).toContain('Plan de prueba');
  expect(app.textContent).toContain('Cambiar el agua');
  click('[data-action="pj-edit"]'); await wait(); // volver mantiene el modo pegar
  expect(document.getElementById('pj-raw').value).toContain('Plan de prueba');
  click('[data-action="pj-read"]'); await wait();
  click('[data-action="pj-create"]'); await wait();
  expect(location.hash).toMatch(/^#\/proyecto\/j/);
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.projects[0].name).toBe('Esquejes de prueba');
  expect(s.projects[0].tasks.length).toBeGreaterThan(0);
  expect(document.querySelector('[data-action="pj-task-photo"]')).toBeTruthy(); // se puede subir foto desde la tarea
});
