import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('pasar todas las tareas pendientes al sábado', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const base = { photo: '', everyDays: 7, lastWatered: d(-1), history: [], placement: 'interior-luz', zone: 'baja' };
  const task = (id, due) => ({ id, title: `T ${id}`, detail: '', due, time: '09:00', every: null, left: null, source: 'novedad' });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [{ ...base, id: 'a', nid: 1, name: 'Palmera', species: 'Chamaedorea elegans', sci: 'Chamaedorea elegans', tasks: [task('t1', d(0)), task('t2', d(-3))] }],
    projects: [{ id: 'j1', name: 'Proy', icon: '🌱', startDate: d(-5), plan: { etapas: [{ dia: 0, titulo: 'x', detalle: '' }] }, tasks: [task('t3', d(0))], log: [], done: false }],
    nextNid: 2,
    keys: {},
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(80);
  const app = document.getElementById('app');
  const btn = app.querySelector('[data-action="tasks-saturday"]');
  expect(btn).toBeTruthy();
  btn.click(); await wait();
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  const dues = [...s.plants[0].tasks.map((t) => t.due), s.projects[0].tasks[0].due];
  expect(new Set(dues).size).toBe(1);
  expect(new Date(`${dues[0]}T12:00:00`).getDay()).toBe(6);
  expect(dues[0] > d(0)).toBe(true);
  expect(app.querySelector('[data-action="tasks-saturday"]')).toBeFalsy();
});
