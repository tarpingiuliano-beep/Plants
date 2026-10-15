import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  daysBetween,
  waterStatus,
  statusText,
  buildSchedule,
  newPlant,
  waterPlant,
  sortPlants,
} from '../src/logic.js';

const settings = { hour: 9, minute: 0 };

function plant(over = {}) {
  return { ...newPlant({ nid: 1, name: 'Monstera', everyDays: 7, lastWatered: '2026-10-10' }), ...over };
}

test('addDays y daysBetween cruzan meses', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(daysBetween('2026-11-02', '2026-10-30'), -3);
});

test('estado de riego', () => {
  const p = plant(); // vence 2026-10-17
  assert.deepEqual(waterStatus(p, '2026-10-15'), { days: 2, state: 'soon' });
  assert.equal(waterStatus(p, '2026-10-17').state, 'today');
  assert.equal(waterStatus(p, '2026-10-18').state, 'overdue');
  assert.equal(waterStatus(p, '2026-10-12').state, 'ok');
  assert.equal(statusText(waterStatus(p, '2026-10-19')), 'Atrasada 2 días');
  assert.equal(statusText(waterStatus(p, '2026-10-16')), 'Regar mañana');
});

test('agenda: planta con riego a futuro', () => {
  const now = new Date(2026, 9, 15, 10, 0); // 15/10 10:00
  const s = buildSchedule([plant()], settings, now);
  assert.equal(s.length, 4);
  assert.equal(s[0].at.getDate(), 17);
  assert.equal(s[0].at.getHours(), 9);
  assert.match(s[0].title, /Hoy toca regar/);
  assert.match(s[1].title, /esperando agua/);
  assert.deepEqual(s.map((x) => x.id), [10, 11, 12, 13]);
});

test('agenda: planta atrasada arranca hoy o mañana según la hora', () => {
  const p = plant({ lastWatered: '2026-10-01' }); // vencía el 8
  const antes = buildSchedule([p], settings, new Date(2026, 9, 15, 8, 0));
  assert.equal(antes[0].at.getDate(), 15);
  const despues = buildSchedule([p], settings, new Date(2026, 9, 15, 10, 0));
  assert.equal(despues[0].at.getDate(), 16);
  assert.equal(despues.length, 3);
  assert.match(despues[0].body, /Hace 8 días/);
});

test('agenda: no programa nada en el pasado', () => {
  const p = plant();
  const s = buildSchedule([p], settings, new Date(2026, 9, 25, 12, 0));
  assert.ok(s.every((x) => x.at > new Date(2026, 9, 25, 12, 0)));
});

test('regar reinicia el contador y guarda historial', () => {
  const p = plant();
  const w = waterPlant(p, new Date(2026, 9, 15, 10, 0));
  assert.equal(w.lastWatered, '2026-10-15');
  assert.equal(w.history.length, 1);
  assert.equal(w.history[0].type, 'riego');
  assert.equal(p.history.length, 0); // no muta
});

test('orden: la más urgente primero', () => {
  const a = plant({ id: 'a', name: 'A', lastWatered: '2026-10-14' });
  const b = plant({ id: 'b', name: 'B', lastWatered: '2026-10-01' });
  assert.deepEqual(sortPlants([a, b], '2026-10-15').map((p) => p.id), ['b', 'a']);
});
