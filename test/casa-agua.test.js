import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ZONES, fitZone, assess, cleanZones, zoneOf } from '../src/casa.js';
import { waterRenewDays, waterFit, parseWater, buildWaterPrompt, cleaningTask } from '../src/agua.js';
import { lookup } from '../src/species.js';

const care = (o) => ({ sci: 'x', light: 2, minTemp: 10, humidity: 'media', outdoorOk: true, generic: false, ...o });

test('zonas por defecto: 5 lugares con datos coherentes', () => {
  assert.equal(DEFAULT_ZONES.length, 5);
  assert.equal(cleanZones(DEFAULT_ZONES).length, 5);
  assert.ok(zoneOf(DEFAULT_ZONES, 'borde').outdoor);
  assert.ok(zoneOf(DEFAULT_ZONES, 'alta').hot);
});

test('planta de sol pleno en la planta baja: no le queda; recomienda el patio', () => {
  const a = assess({ zone: 'baja' }, care({ light: 4, minTemp: -2 }), DEFAULT_ZONES, null);
  assert.equal(a.state, 'mal');
  assert.equal(a.move.zone.id, 'patio-sol');
  assert.match(a.fit.reasons[0], /Le falta luz/);
});

test('planta de sombra al sol del patio: se quema; recomienda adentro', () => {
  const a = assess({ zone: 'patio-sol' }, care({ light: 1.5 }), DEFAULT_ZONES, null);
  assert.equal(a.state, 'mal');
  assert.ok(!a.move.zone.outdoor);
});

test('lugar calurosa y planta que no tolera más de 32 °C', () => {
  const f = fitZone(care({ light: 2.5, maxTemp: 32 }), zoneOf(DEFAULT_ZONES, 'alta'), null);
  assert.equal(f.level, 'mal');
  assert.match(f.reasons.join(' '), /32 °C/);
});

test('helada próxima: la que aguanta poco tiene que entrar', () => {
  const f = fitZone(care({ light: 3, minTemp: 8 }), zoneOf(DEFAULT_ZONES, 'borde'), { minNext3: 4 });
  assert.equal(f.level, 'mal');
  assert.match(f.reasons.join(' '), /adentro/);
});

test('sin lugar definido: lo pide y sugiere uno; sin datos de la especie no opina', () => {
  const a = assess({}, care({ light: 4, minTemp: -2 }), DEFAULT_ZONES, null);
  assert.equal(a.state, 'sin-lugar');
  assert.equal(a.move.zone.id, 'patio-sol');
  assert.equal(assess({ zone: 'baja' }, care({ generic: true }), DEFAULT_ZONES, null).state, 'sin-datos');
});

test('bien ubicada: no recomienda mover', () => {
  const a = assess({ zone: 'baja' }, care({ light: 2 }), DEFAULT_ZONES, null);
  assert.equal(a.state, 'bien');
  assert.equal(a.move, null);
});

test('agua: intervalo según temperatura y aptitud por especie', () => {
  assert.equal(waterRenewDays(30), 4);
  assert.equal(waterRenewDays(20), 7);
  assert.equal(waterRenewDays(5), 12);
  assert.equal(waterRenewDays(NaN), 7);
  assert.equal(waterFit({ sci: 'Dracaena trifasciata', name: 'Lengua de suegra' }).level, 'cuidado');
  assert.equal(waterFit({ sci: 'Echeveria elegans', name: 'Echeveria' }).level, 'no');
  assert.equal(waterFit({ sci: 'Epipremnum aureum', name: 'Poto' }).level, 'ok');
  assert.equal(waterFit({ name: 'Rara' }).level, 'sin-dato');
  assert.ok(lookup('Dracaena trifasciata'));
});

test('agua: pedido a Gemini, lectura y tarea de limpieza', () => {
  const p = buildWaterPrompt({ plant: { name: 'Lengua de suegra', everyDays: 7 }, sci: 'Dracaena trifasciata', place: { name: 'Venado Tuerto' } });
  assert.match(p, /viviendo en agua/);
  const w = parseWater('```json\n{"apta":"con cuidado","cada_dias":6,"consejos":["a","b"],"riesgos":["x"],"nutrientes":"una gota","paso_a_tierra":null,"seguridad":"media"}\n```');
  assert.equal(w.dias, 6);
  assert.equal(w.consejos.length, 2);
  assert.equal(parseWater('hola'), null);
  const t = cleaningTask('2026-11-09');
  assert.equal(t.due, '2026-12-07');
  assert.equal(t.every, 28);
});

import { buildBackup, parseBackup, replaceWith, mergeWith } from '../src/backup.js';
import { buildSchedule, statusText, newPlant } from '../src/logic.js';
import { buildPrompt } from '../src/novedad.js';

test('los lugares viajan en el respaldo y se mezclan sin pisar los editados', () => {
  const zones = cleanZones(DEFAULT_ZONES).map((z) => (z.id === 'borde' ? { ...z, name: 'Mi balcón' } : z));
  const text = JSON.stringify(buildBackup({ plants: [{ id: 'p', name: 'A', history: [] }], zones, species: {}, settings: {}, nextNid: 2 }));
  const r = parseBackup(text);
  assert.equal(r.backup.data.zones.find((z) => z.id === 'borde').name, 'Mi balcón');
  const cur = { plants: [], zones: [{ ...zones[0] }], nextNid: 1, species: {}, settings: {} };
  assert.equal(replaceWith(cur, r.backup.data).zones.length, 5);
  assert.equal(mergeWith(cur, r.backup.data).data.zones.length, 5);
  assert.equal(mergeWith(cur, r.backup.data).data.zones[0].id, zones[0].id);
});

test('planta en agua: avisos y textos de renovar el agua', () => {
  const p = newPlant({ nid: 1, name: 'Lengua', everyDays: 5, lastWatered: '2026-11-01', water: true, zone: 'baja' }, new Date('2026-11-01T10:00:00'));
  assert.equal(p.water, true);
  const sched = buildSchedule([p], { hour: 9, minute: 0 }, new Date('2026-11-02T10:00:00'));
  assert.match(sched[0].title, /renovar el agua: Lengua/);
  assert.match(sched[1].title, /necesita agua nueva/);
  assert.equal(statusText({ days: 0, state: 'today' }, true), 'Renovar el agua hoy');
  assert.equal(statusText({ days: -2, state: 'overdue' }, true), 'Agua atrasada 2 días');
  const pr = buildPrompt({ plant: p, text: 'hojas amarillas', photoCount: 0, zone: 'Adentro · planta baja' });
  assert.match(pr, /en agua \(frasco\)/);
  assert.match(pr, /Lugar en mi casa: Adentro · planta baja/);
});
