import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

test('proyecto: hacer una tarea atrasada ofrece correr las siguientes', async () => {
  window.scrollTo = () => {};
  const T = (id, due) => ({ id, title: `Tarea ${id}`, detail: '', due, time: '09:00', every: null, left: null, source: 'proyecto' });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [], nextNid: 1, settings: { hour: 9, minute: 0 },
    projects: [{ id: 'j1', name: 'Esquejes', icon: '✂️', startDate: d(-5), done: false, plan: { resumen: '', diagnostico: '', materiales: [], consejos: [], alertas: [], etapas: [{ dia: 0, titulo: 'x', detalle: '', cada: null, veces: null }], source: 'Gemini', confidence: 'media' }, log: [], description: '', tasks: [T('A', d(-2)), T('A2', d(-2)), T('B', d(3)), T('C', d(10))] }],
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(60);
  location.hash = '#/proyecto/j1'; await wait();
  const dueOf = () => Object.fromEntries(JSON.parse(localStorage.getItem('plantas.v1')).projects[0].tasks.map((t) => [t.id, t.due]));

  // dice que no: solo se hace A, lo demás queda igual
  window.confirm = () => false;
  document.querySelector('[data-action="task-done"][data-tid="A"]').click(); await wait();
  expect(dueOf()).toEqual({ A2: d(-2), B: d(3), C: d(10) });

  // dice que sí: A2 estaba atrasada 2 días → B y C se corren 2 días
  let asked = '';
  window.confirm = (m) => ((asked = m), true);
  document.querySelector('[data-action="task-done"][data-tid="A2"]').click(); await wait();
  expect(asked).toContain('2 días tarde');
  expect(asked).toContain('las 2 tareas que siguen');
  expect(dueOf()).toEqual({ B: d(5), C: d(12) });
  expect(document.getElementById('toast').textContent).toContain('se corrió 2 días');

  // a tiempo: no pregunta
  asked = '';
  document.querySelector('[data-action="task-done"][data-tid="B"]').click(); await wait();
  expect(asked).toBe('');
});
