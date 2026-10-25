import 'fake-indexeddb/auto';
import { test, expect } from 'vitest';
import { flushNow, loadAsync, storageBackend } from '../src/store.js';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const dstr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('memoria grande + calibración: migra, riega, cuenta cómo estaba la tierra y aprende', async () => {
  window.scrollTo = () => {};
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [
      { id: 'a', nid: 1, name: 'Palmera', sci: 'Chamaedorea elegans', placement: 'interior-luz', photo: '', auto: true, baseDays: 7, everyDays: 7, lastWatered: dstr(-7), history: [] },
      { id: 'b', nid: 2, name: 'Manual', sci: '', placement: 'interior-luz', photo: '', auto: false, everyDays: 5, lastWatered: dstr(-5), history: [] },
    ],
    nextNid: 3,
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(100);
  const app = document.getElementById('app');

  expect(storageBackend()).toBe('idb');
  expect(localStorage.getItem('plantas.v1')).toBeNull(); // migró y borró el original
  expect(app.textContent).toContain('Palmera');

  // una planta manual no pregunta por la tierra
  document.querySelector('[data-action="water"][data-id="b"]').click(); await wait();
  expect(document.querySelector('.sheet')).toBeNull();

  // la automática sí
  document.querySelector('[data-action="water"][data-id="a"]').click(); await wait();
  expect(document.querySelector('.sheet')).not.toBeNull();
  document.querySelector('[data-action="soil"][data-v="humeda"]').click(); await wait();
  expect(document.querySelector('.sheet')).toBeNull();

  await flushNow();
  const s = await loadAsync();
  const a = s.plants.find((p) => p.id === 'a');
  expect(a.calib).toBe(1.12);
  expect(a.calibN).toBe(1);
  expect(a.history[0].soil).toBe('humeda');
  expect(a.everyDays).toBe(8); // 7 × 1,12

  location.hash = '#/p/a'; await wait();
  expect(app.textContent).toContain('Aprendí el ritmo de esta planta en 1 riego');
  expect(app.textContent).toContain('la tierra estaba todavía húmeda');
  document.querySelector('[data-action="calib-reset"]').click(); await wait();
  await flushNow();
  expect((await loadAsync()).plants.find((p) => p.id === 'a').calib).toBe(1);

  // "se veía mal" no calibra y lleva a Sumar novedad
  document.querySelector('[data-action="water"]').click(); await wait();
  document.querySelector('[data-action="soil"][data-v="mal"]').click(); await wait();
  expect(location.hash).toBe('#/novedad/a');
  await flushNow();
  expect((await loadAsync()).plants.find((p) => p.id === 'a').calib).toBe(1);
});
