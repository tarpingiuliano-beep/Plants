import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsOf, eventsInMonth, buildMonthlyDigests, digestText, monthsText } from '../src/extras.js';

const extraA = {
  abono: { meses: [9, 10, 11], cadaDias: 21, conLoQueTengo: 'Una cucharada de humus', detalle: '' },
  poda: { meses: [9], detalle: 'Sacá hojas secas' },
  trasplante: null,
  reproduccion: {
    metodos: [{ tipo: 'esqueje', meses: [10, 11], pasos: ['Cortá 10 cm'] }],
    semillas: { meses: [3, 4], pasos: ['Esperá a que seque la cápsula'] },
  },
  plagas: [],
};
const extraB = { abono: { meses: [10], cadaDias: null, conLoQueTengo: '', detalle: 'x' }, poda: null, trasplante: { meses: [3], cadaMeses: 24, detalle: 'd' }, reproduccion: { metodos: [], semillas: null }, plagas: [] };
const plants = [{ id: 'a', name: 'Impatiens' }, { id: 'b', name: 'Palta' }, { id: 'c', name: 'Sin datos' }];
const getExtra = (p) => ({ a: extraA, b: extraB }[p.id]);

test('eventos de una especie con su texto', () => {
  const ev = eventsOf(extraA);
  assert.deepEqual(ev.map((e) => e.label), ['Abonar', 'Podar', 'Hacer esquejes', 'Cosechar semillas']);
  assert.match(ev[0].text, /Cada 21 días/);
  assert.match(ev[0].text, /humus/);
  assert.deepEqual(eventsOf(null), []);
});

test('qué toca cada mes', () => {
  const oct = eventsInMonth(plants, getExtra, 10);
  assert.equal(oct.length, 3);
  assert.equal(digestText(oct), 'Abonar: Impatiens, Palta · Hacer esquejes: Impatiens');
  assert.equal(eventsInMonth(plants, getExtra, 7).length, 0);
});

test('aviso mensual: día 1 a las 10:00, solo meses con algo, ids únicos', () => {
  const now = new Date(2026, 9, 25, 12, 0); // 25 oct
  const out = buildMonthlyDigests(plants, getExtra, now);
  const months = out.map((o) => o.at.getMonth() + 1);
  assert.deepEqual(months, [11, 3, 4, 9]); // nov, mar, abr, sep (12 meses hacia adelante)
  assert.ok(out.every((o) => o.at.getDate() === 1 && o.at.getHours() === 10 && o.at > now));
  assert.equal(new Set(out.map((o) => o.id)).size, out.length);
  assert.match(out[0].title, /Noviembre/);
  assert.match(out[0].body, /Abonar: Impatiens/);
  assert.deepEqual(buildMonthlyDigests([plants[2]], getExtra, now), []);
});

test('meses en texto', () => {
  assert.equal(monthsText([3, 4]), 'marzo y abril');
  assert.equal(monthsText([9, 10, 11]), 'septiembre a noviembre');
  assert.equal(monthsText([1, 5, 6]), 'enero, mayo y junio');
  assert.equal(monthsText([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'todo el año');
});
