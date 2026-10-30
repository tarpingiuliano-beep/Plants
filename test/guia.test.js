import test from 'node:test';
import assert from 'node:assert/strict';
import { monthStartOf, isHidden, applyFeedback, defaultDays, parseFeedback, parseGuide, GENERIC_GUIDES, startGuide, advanceGuide, retryStep, cancelGuide } from '../src/guia.js';
import { eventsInMonth, buildMonthlyDigests } from '../src/extras.js';

const plant = () => ({ id: 'a', name: 'Violeta', history: [], tasks: [] });
const extra = { abono: { meses: [10, 11], cadaDias: 30 }, reproduccion: { metodos: [{ tipo: 'esqueje', meses: [10, 11], pasos: [] }], semillas: null } };

test('feedback silencia el evento hasta la fecha y lo muestra después', () => {
  const p = applyFeedback(plant(), 'esquejes', 'Hacer esquejes', { status: 'despues', reason: 'es chica' }, '2026-10-30');
  assert.equal(p.seasonLog.esquejes.until, '2026-12-14');
  assert.ok(isHidden(p, 'esquejes', '2026-11-01'));
  assert.ok(!isHidden(p, 'esquejes', '2026-12-15'));
  assert.match(p.history[0].note, /es chica/);
  const hidden = (pl, ev, m) => isHidden(pl, ev.kind, monthStartOf(m, new Date(2026, 9, 30)));
  assert.equal(eventsInMonth([p], () => extra, 11, hidden).length, 1); // solo abono
  assert.equal(eventsInMonth([p], () => extra, 11).length, 2);
  const d = buildMonthlyDigests([p], () => extra, new Date(2026, 9, 30), 3, hidden);
  assert.ok(!/esquejes/i.test(d[0].body));
});

test('la IA define los días y la etapa; hecho usa el intervalo del abono', () => {
  const p = applyFeedback(plant(), 'esquejes', 'Hacer esquejes', { status: 'no', reason: 'chica', ai: { volverEnDias: 90, queMirar: 'tallos de 10 cm', etapa: 'chica' } }, '2026-10-30');
  assert.equal(p.seasonLog.esquejes.days, 90);
  assert.equal(p.stage, 'chica');
  assert.equal(defaultDays('hecho', 'abono', extra), 30);
  assert.equal(defaultDays('despues', 'poda', null), 45);
  const ok = parseFeedback('{"resumen":"ok","volver_en_dias":9999,"que_mirar":"x","etapa":"rara"}');
  assert.equal(ok.volverEnDias, 365);
  assert.equal(ok.etapa, null);
  assert.equal(parseFeedback('nada'), null);
});

test('monthStartOf', () => {
  const now = new Date(2026, 9, 30);
  assert.equal(monthStartOf(10, now), '2026-10-30');
  assert.equal(monthStartOf(12, now), '2026-12-01');
  assert.equal(monthStartOf(3, now), '2027-03-01');
});

test('guía: pasos con esperas, reintento y final', () => {
  let p = startGuide(plant(), 'semillas', 'Cosechar semillas', GENERIC_GUIDES.semillas, '09:00', '2026-10-30');
  assert.equal(p.tasks.length, 1);
  assert.equal(p.tasks[0].retry, 4);
  p = retryStep(p, p.tasks[0].id, '2026-10-30');
  assert.equal(p.tasks[0].due, '2026-11-03');
  p = advanceGuide(p, p.tasks[0].id, '09:00', '2026-11-03');
  assert.equal(p.tasks[0].stepIdx, 1);
  assert.equal(p.tasks[0].due, '2026-11-03'); // espera del paso 0 = 0
  p = advanceGuide(p, p.tasks[0].id, '09:00', '2026-11-03');
  assert.equal(p.tasks[0].due, '2026-11-06'); // secado 3 días
  p = advanceGuide(p, p.tasks[0].id, '09:00', '2026-11-06');
  p = advanceGuide(p, p.tasks[0].id, '09:00', '2026-11-07');
  assert.equal(p.tasks.length, 0);
  assert.ok(p.guide.done);
  assert.equal(cancelGuide(p).guide, null);
});

test('parseGuide valida', () => {
  const g = parseGuide('{"pasos":[{"titulo":"a","detalle":"d","espera_dias":3,"reintento_dias":5},{"titulo":""}],"seguridad":"alta"}');
  assert.equal(g.pasos.length, 1);
  assert.equal(g.pasos[0].reintento_dias, 5);
  assert.equal(parseGuide('{"pasos":[]}'), null);
});
