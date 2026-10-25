import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, extractJson, parseAnswer, tasksFromActions, completeTask, buildTaskSchedule, dueTasks, taskText } from '../src/novedad.js';

const plant = { id: 'p1', nid: 1, name: 'Palmera', sci: 'Chamaedorea elegans', everyDays: 7, lastWatered: '2026-10-10', history: [], tasks: [] };

test('el pedido incluye contexto y el formato', () => {
  const t = buildPrompt({ plant, placement: { label: 'Interior luminoso' }, text: 'manchas marrones', photoCount: 2, today: '2026-10-15' });
  assert.match(t, /Palmera \(Chamaedorea elegans\)/);
  assert.match(t, /manchas marrones/);
  assert.match(t, /2 fotos/);
  assert.match(t, /"repetir_cada_dias"/);
});

test('lee JSON con vallas, texto alrededor y comillas tipográficas', () => {
  const j = '{"resumen":"Hojas con puntas secas","causa_probable":"Aire seco","confianza":"alta","gravedad":"leve","acciones":[{"titulo":"Pulverizar","detalle":"x","en_dias":0,"repetir_cada_dias":3,"veces":4},],}';
  assert.equal(extractJson('Claro:\n```json\n' + j + '\n```\nsuerte').resumen, 'Hojas con puntas secas');
  assert.ok(extractJson(j.replace(/"/g, '"')));
  assert.equal(extractJson('sin json'), null);
});

test('valida y normaliza', () => {
  const r = parseAnswer(JSON.stringify({
    resumen: 'ok', causa_probable: 'c', confianza: 'ALTA', gravedad: 'rara',
    acciones: [{ titulo: 'Revisar', en_dias: '10', repetir_cada_dias: 10, veces: 99 }, { titulo: '' }, { titulo: 'Hoy', en_dias: -5, repetir_cada_dias: 0 }],
  }));
  assert.ok(r.ok);
  assert.equal(r.result.confianza, 'alta');
  assert.equal(r.result.gravedad, 'leve');
  assert.equal(r.result.acciones.length, 2);
  assert.equal(r.result.acciones[0].en_dias, 10);
  assert.equal(r.result.acciones[0].veces, 30);
  assert.equal(r.result.acciones[1].en_dias, 0);
  assert.equal(r.result.acciones[1].repetir_cada_dias, null);
  assert.equal(parseAnswer('').ok, false);
  assert.equal(parseAnswer('hola').ok, false);
  assert.equal(parseAnswer('{"foo":1}').ok, false);
});

test('tareas: una vez, repetidas y fin', () => {
  const ts = tasksFromActions([
    { titulo: 'Poda', detalle: '', en_dias: 2, repetir_cada_dias: null, veces: null, time: '18:30' },
    { titulo: 'Revisar', detalle: '', en_dias: 10, repetir_cada_dias: 10, veces: 2, time: '09:00' },
  ], '2026-10-15');
  assert.equal(ts[0].due, '2026-10-17');
  assert.equal(ts[0].time, '18:30');
  assert.equal(ts[1].due, '2026-10-25');
  let list = completeTask(ts, ts[0].id, '2026-10-17');
  assert.equal(list.length, 1);
  list = completeTask(list, ts[1].id, '2026-10-26'); // se hizo un día tarde: la próxima cuenta desde hoy
  assert.equal(list[0].due, '2026-11-05');
  assert.equal(list[0].left, 1);
  list = completeTask(list, ts[1].id, '2026-11-05');
  assert.equal(list.length, 0);
  const infinite = tasksFromActions([{ titulo: 'x', en_dias: 0, repetir_cada_dias: 5, veces: null }], '2026-10-15');
  assert.equal(completeTask(infinite, infinite[0].id, '2026-10-15')[0].left, null);
});

test('avisos de tareas: hora propia, ids únicos, vencidas', () => {
  const now = new Date(2026, 9, 15, 10, 0);
  const tasks = tasksFromActions([
    { titulo: 'A', en_dias: 0, time: '18:30' },
    { titulo: 'B', en_dias: 3, time: '08:00' },
  ], '2026-10-15');
  const p = { ...plant, tasks };
  const s = buildTaskSchedule([p, { ...plant, id: 'p2', name: 'Otra', tasks: tasksFromActions([{ titulo: 'C', en_dias: -1, time: '09:00' }], '2026-10-15') }], now);
  const a = s.find((x) => x.title === 'Palmera: A');
  assert.equal(a.at.getHours(), 18);
  assert.equal(a.at.getMinutes(), 30);
  assert.equal(a.plantId, 'p1');
  assert.equal(new Set(s.map((x) => x.id)).size, s.length);
  assert.ok(s.every((x) => x.id >= 1000000 && x.at > now));
  assert.ok(s.some((x) => /Pendiente en Otra: C/.test(x.title)));
  assert.equal(dueTasks([p], '2026-10-15').length, 1);
  assert.match(taskText(tasks[1], '2026-10-15'), /en 3 días · 08:00/);
});

import { makeTask } from '../src/novedad.js';

test('tarea de temporada: al repetirse salta al primer día de la próxima temporada', () => {
  const t = makeTask({ title: 'Abonar', due: '2026-11-20', every: 21, months: [9, 10, 11] });
  // se hace el 20/11: +21 días = 11/12, fuera de temporada → primer día de septiembre del año siguiente
  const next = completeTask([t], t.id, '2026-11-20')[0];
  assert.equal(next.due, '2027-09-01');
  // dentro de temporada no salta
  const t2 = makeTask({ title: 'Abonar', due: '2026-09-10', every: 21, months: [9, 10, 11] });
  assert.equal(completeTask([t2], t2.id, '2026-09-10')[0].due, '2026-10-01');
});
