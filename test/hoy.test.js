import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsUpTo, pendingItems, buildDailySummary, ensureTracks, defaultTrack } from '../src/hoy.js';

const plant = (o = {}) => ({ id: 'a', nid: 1, name: 'Palma', everyDays: 7, lastWatered: '2026-11-10', tasks: [], history: [], createdAt: '2026-10-01T12:00:00.000Z', ...o });
const task = (id, due) => ({ id, title: id, due, time: '09:00' });

test('pendientes: atrasado y de hoy, riegos + tareas + medidas', () => {
  const p = plant({ tasks: [task('t1', '2026-11-20'), task('t2', '2026-11-25')], track: { every: 30, next: '2026-11-21', on: true } });
  const j = { id: 'j', name: 'Proy', done: false, tasks: [task('t3', '2026-11-21')] };
  const r = pendingItems([p], [j], '2026-11-21');
  assert.equal(r.all.filter((i) => i.kind === 'water').length, 1); // vencía el 17
  assert.equal(r.all.filter((i) => i.kind === 'task').length, 2); // t1 y t3, no t2
  assert.equal(r.all.filter((i) => i.kind === 'measure').length, 1);
  assert.ok(r.late.length >= 2 && r.today.length >= 2);
  assert.equal(r.all[0].late >= r.all[r.all.length - 1].late, true);
});

test('proyectos terminados y mediciones apagadas no aparecen', () => {
  const p = plant({ lastWatered: '2026-11-21', track: { every: 30, next: '2026-11-01', on: false } });
  const j = { id: 'j', name: 'X', done: true, tasks: [task('t', '2026-11-01')] };
  assert.equal(itemsUpTo([p], [j], '2026-11-21').length, 0);
});

test('resumen diario: un aviso por mañana con el total acumulado', () => {
  const p = plant({ tasks: [task('t1', '2026-11-22')], track: { every: 30, next: '2027-01-01', on: true } });
  const now = new Date('2026-11-21T12:00:00-03:00');
  const s = buildDailySummary([p], [], { hour: 9, minute: 0 }, now, 3);
  assert.equal(s.length, 3); // 22, 23 y 24 (el 21 a las 9 ya pasó)
  assert.match(s[0].title, /1 riego y 1 tarea/);
  assert.match(s[0].body, /atrasada/);
  assert.equal(new Set(s.map((x) => x.id)).size, s.length);
  assert.equal(s[0].plantId, '');
});

test('resumen diario: sin nada pendiente no avisa', () => {
  const p = plant({ lastWatered: '2026-11-21', everyDays: 30, track: { every: 30, next: '2027-02-01', on: true } });
  assert.equal(buildDailySummary([p], [], { hour: 9, minute: 0 }, new Date('2026-11-21T12:00:00-03:00'), 5).length, 0);
});

test('seguimiento por defecto: se reparte y no toca lo existente', () => {
  const t = defaultTrack(plant({ nid: 5 }), '2026-11-21'); // creada hace más de 30 días
  assert.equal(t.next, '2026-11-27');
  const mine = { every: 15, next: '2026-12-01', on: true };
  const out = ensureTracks([plant({ track: mine }), plant({ id: 'b' })], '2026-11-21');
  assert.deepEqual(out[0].track, mine);
  assert.ok(out[1].track.next);
});
