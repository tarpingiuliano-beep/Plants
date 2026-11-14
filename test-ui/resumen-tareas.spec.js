import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();

test('Ver resumen muestra las tareas de todas las plantas y proyectos, y permite resolverlas desde ahí', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const base = { photo: '', everyDays: 7, lastWatered: d(-1), history: [], placement: 'interior-luz', zone: 'baja' };
  const task = (id, title, due) => ({ id, title, detail: `detalle ${title}`, due, time: '09:00', every: null, left: null, source: 'novedad' });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [
      { ...base, id: 'a', nid: 1, name: 'Palma bambú', species: 'Chamaedorea', sci: 'Chamaedorea elegans', tasks: [task('t1', 'Agregar sustrato', d(0)), task('t2', 'Podar hojas secas', d(-2))] },
      { ...base, id: 'b', nid: 2, name: 'Alegría del hogar', species: 'Impatiens', sci: 'Impatiens walleriana', tasks: [task('t3', 'Hacer esquejes', d(0)), task('t4', 'Revisar', d(3))] },
    ],
    projects: [{ id: 'j1', name: 'Albahaca', icon: '🌿', startDate: d(-1), log: [], done: false, plan: { etapas: [] }, tasks: [task('t5', 'Limpiar bichos', d(0))] }],
    nextNid: 3, keys: {},
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(80);
  const app = document.getElementById('app');
  expect(app.textContent).toContain('4 tareas para hoy');
  click('[data-action="tareas"]'); await wait(60);
  expect(location.hash).toBe('#/tareas');
  for (const txt of ['Resumen de tareas', 'Palma bambú', 'Alegría del hogar', 'Albahaca', 'Agregar sustrato', 'Podar hojas secas', 'Hacer esquejes', 'Limpiar bichos', 'Esta semana', 'Revisar']) expect(app.textContent).toContain(txt);
  expect(app.textContent).toContain('4 tareas de hoy o atrasadas, en 3 plantas o proyectos');

  // hecha desde el resumen
  click('[data-action="task-done"][data-tid="t1"]'); await wait(60);
  expect(app.textContent).not.toContain('Agregar sustrato');
  // mover una a mañana
  click('[data-action="task-move"][data-to="1"][data-tid="t3"]'); await wait(60);
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.plants[1].tasks.find((t) => t.id === 't3').due).toBe(d(1));
  expect(app.textContent).toContain('2 tareas de hoy o atrasadas');
  // todo al sábado vacía lo pendiente
  click('[data-action="tasks-saturday"]'); await wait(60);
  expect(app.textContent).toContain('Todo al día por hoy');
});
