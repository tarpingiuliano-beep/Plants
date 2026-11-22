import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('una especie guardada con datos de la familia pasa a los datos propios de la tabla (Vinca al sol)', async () => {
  window.scrollTo = () => {};
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [{ id: 'v', nid: 1, name: 'Vinca', sci: 'Catharanthus roseus', genus: 'Catharanthus', family: 'Apocynaceae', placement: 'jardin', photo: '', everyDays: 5, lastWatered: '2026-11-20', history: [], tasks: [] }],
    species: { 'Catharanthus roseus': { sci: 'Catharanthus roseus', names: [], care: { sci: 'Catharanthus roseus', days: 12, light: 2.5, minTemp: 10, humidity: 'baja', outdoorOk: false, tips: [], names: [], source: 'familia', generic: false }, wiki: '', addedAt: 1 } },
    nextNid: 2, keys: {},
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(80);
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.species['Catharanthus roseus'].care.source).toBe('especie');
  expect(s.species['Catharanthus roseus'].care.light).toBe(4);
  expect(s.species['Catharanthus roseus'].care.outdoorOk).toBe(true);
});
