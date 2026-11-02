import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGeneral, buildGeneralPrompt, parseGeneral } from '../src/general.js';

const mk = (id, last) => ({ id, name: id.toUpperCase(), everyDays: 7, lastWatered: last, history: [], tasks: [] });
const now = new Date(2026, 10, 2, 10, 0);

test('regué ayer con té: riego en esa fecha, solo en las tildadas; abono cuenta como hecho', () => {
  const ps = [mk('a', '2026-10-28'), mk('b', '2026-10-28'), mk('suc', '2026-10-20')];
  const out = applyGeneral(ps, { ids: ['a', 'b'], text: 'con té de banana', date: '2026-11-01', kinds: ['riego', 'abono'] }, () => ({ abono: { cadaDias: 30 } }), now);
  assert.equal(out[0].lastWatered, '2026-11-01');
  assert.equal(out[2].lastWatered, '2026-10-20');
  assert.equal(out[2].history.length, 0);
  assert.ok(out[0].history.some((h) => h.type === 'riego' && /té de banana/.test(h.note)));
  assert.equal(out[0].seasonLog.abono.status, 'hecho');
  assert.equal(out[2].seasonLog, undefined);
});

test('un riego más viejo que el último no lo pisa', () => {
  const out = applyGeneral([mk('a', '2026-11-02')], { ids: ['a'], text: 'x', date: '2026-10-30', kinds: ['riego'] }, () => null, now);
  assert.equal(out[0].lastWatered, '2026-11-02');
  assert.match(out[0].history[0].note, /riego más reciente/);
});

test('solo nota si no hay tipo de riego', () => {
  const out = applyGeneral([mk('a', '2026-10-28')], { ids: ['a'], text: 'le puse tierra nueva', date: '2026-11-02', kinds: ['otra'] }, () => null, now);
  assert.equal(out[0].lastWatered, '2026-10-28');
  assert.equal(out[0].history[0].type, 'nota');
});

test('prompt lista solo las plantas elegidas; parse descarta ids ajenos', () => {
  const p = buildGeneralPrompt({ text: 'té de banana', date: '2026-11-01', kinds: ['riego'], plants: [{ id: 'a', name: 'A', everyDays: 7, lastWatered: '2026-11-01', pending: ['Revisar'] }], today: '2026-11-02' });
  assert.match(p, /id a: A/);
  assert.match(p, /hoy es 2026-11-02/);
  const r = parseGeneral('{"resumen":"ok","plantas":[{"id":"a","evaluacion":"bien","tareas":[{"titulo":"Revisar hojas","en_dias":3}]},{"id":"zzz","tareas":[]}]}', ['a']);
  assert.equal(r.plantas.length, 1);
  assert.equal(r.plantas[0].tareas[0].titulo, 'Revisar hojas');
  assert.equal(parseGeneral('nada', ['a']), null);
});
