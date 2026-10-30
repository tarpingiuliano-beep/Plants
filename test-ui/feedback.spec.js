import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => document.querySelector(sel).click();
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

test('temporada: todavía no con motivo, y guía de semillas paso a paso', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [{ id: 'v', nid: 1, name: 'Violeta', sci: 'Streptocarpus ionanthus', species: '', placement: 'interior-luz', photo: '', everyDays: 7, lastWatered: today, history: [] }],
    nextNid: 2, settings: { hour: 8, minute: 30 },
    species: { 'Streptocarpus ionanthus': { sci: 'Streptocarpus ionanthus', names: ['Violeta'], extra: {
      abono: null, poda: null, trasplante: null,
      reproduccion: { metodos: [{ tipo: 'esqueje', meses: ALL, pasos: ['cortar una hoja'] }], semillas: { meses: ALL, pasos: ['secar la cápsula'] } },
      plagas: [], confidence: 'media', fetchedAt: Date.now() } } },
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');

  location.hash = '#/p/v'; await wait();
  expect(app.textContent).toContain('Hacer esquejes');
  click('[data-action="ev-later"][data-kind="esquejes"]'); await wait();
  expect(app.textContent).toContain('¿Por qué?');
  document.getElementById('fb-reason').value = 'la planta es chica';
  click('[data-action="fb-send"]'); await wait(80);
  expect(app.textContent).toContain('Te lo vuelvo a proponer el');
  click('[data-action="fb-close"]'); await wait();
  expect(app.textContent).toContain('⏸ Hacer esquejes: todavía no (la planta es chica)');
  expect(app.querySelector('[data-action="ev-later"][data-kind="esquejes"]')).toBeNull();
  expect(app.querySelector('[data-action="rc-yes"]')).not.toBeNull(); // tarea de revisión
  let s = JSON.parse(localStorage.getItem('plantas.v1') || '{}');

  // guía de semillas
  click('[data-action="guide-start"][data-kind="semillas"]'); await wait(80);
  expect(app.textContent).toContain('En curso: Cosechar semillas');
  expect(app.textContent).toContain('Ver si las semillas están listas');
  expect(app.querySelector('[data-action="task-later"]')).not.toBeNull();
  click('[data-action="task-done"]'); await wait();
  expect(app.textContent).toContain('Paso 2 de 4');
  expect(app.textContent).toContain('Recoger y secar');
});
