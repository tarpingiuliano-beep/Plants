import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();

test('sumar novedad: pedido, respuesta pegada, tareas y hecha', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [{ id: 'a', nid: 1, name: 'Palmera', sci: '', species: '', placement: 'interior-luz', photo: '', everyDays: 7, lastWatered: new Date().toISOString().slice(0, 10), history: [] }],
    nextNid: 2, settings: { hour: 8, minute: 30 },
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');

  location.hash = '#/p/a'; await wait();
  expect(app.textContent).toContain('Sumar novedad');
  click('[data-action="nov-start"]'); await wait();
  expect(location.hash).toBe('#/novedad/a');

  // sin texto ni fotos no avanza
  click('[data-action="nov-build"]'); await wait();
  expect(app.textContent).toContain('Escribí qué notaste');

  document.getElementById('nov-text').value = 'manchas marrones';
  click('[data-action="nov-build"]'); await wait();
  expect(app.textContent).toContain('Llevalo a Gemini');
  expect(app.querySelector('details textarea').value).toContain('manchas marrones');

  // respuesta inválida
  document.getElementById('nov-raw').value = 'no sé';
  click('[data-action="nov-read"]'); await wait();
  expect(app.textContent).toContain('No pude leer la respuesta');

  // respuesta válida, dentro de una valla de código
  document.getElementById('nov-raw').value = 'Acá va:\n```json\n' + JSON.stringify({
    resumen: 'Manchas por exceso de sol', causa_probable: 'Sol directo', confianza: 'media', gravedad: 'leve',
    acciones: [
      { titulo: 'Mover a luz filtrada', detalle: 'Lejos de la ventana', en_dias: 0 },
      { titulo: 'Revisar evolución', detalle: 'Sacar foto', en_dias: 10, repetir_cada_dias: 10, veces: 3 },
      { titulo: 'Descartada', en_dias: 1 },
    ],
  }) + '\n```';
  click('[data-action="nov-read"]'); await wait();
  expect(app.textContent).toContain('Sol directo');
  expect(document.querySelectorAll('.nov-chk').length).toBe(3);
  expect(document.querySelector('.nov-time').value).toBe('08:30');
  document.querySelectorAll('.nov-chk')[2].checked = false;
  document.querySelectorAll('.nov-time')[1].value = '19:15';
  click('[data-action="nov-save"]'); await wait(80);

  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  const p = s.plants[0];
  expect(p.tasks.length).toBe(2);
  expect(p.tasks[1].time).toBe('19:15');
  expect(p.tasks[1].every).toBe(10);
  expect(p.history[0].type).toBe('novedad');
  expect(p.history[0].diagnosis.causa).toBe('Sol directo');
  expect(location.hash).toBe('#/p/a');
  expect(app.textContent).toContain('Mover a luz filtrada');
  expect(app.textContent).toContain('Causa probable: Sol directo');

  // hacer la tarea repetida la reprograma
  click(`[data-action="task-done"][data-tid="${p.tasks[1].id}"]`); await wait();
  const p2 = JSON.parse(localStorage.getItem('plantas.v1')).plants[0];
  expect(p2.tasks.length).toBe(2);
  expect(p2.tasks.find((t) => t.every).left).toBe(2);
  click(`[data-action="task-done"][data-tid="${p.tasks[0].id}"]`); await wait();
  expect(JSON.parse(localStorage.getItem('plantas.v1')).plants[0].tasks.length).toBe(1);

  // el banner de la lista avisa lo de hoy
  location.hash = '#/'; await wait();
  expect(app.textContent).not.toContain('tarea para hoy'); // la que queda es de dentro de 10 días
});
