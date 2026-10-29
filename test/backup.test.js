import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBackup, parseBackup, summarize, replaceWith, mergeWith, backupFileName,
  daysSinceBackup, needsBackupReminder, lastBackupText,
} from '../src/backup.js';

const cur = () => ({
  plants: [{ id: 'a', nid: 1, name: 'A', photo: 'x' }, { id: 'b', nid: 2, name: 'B' }],
  species: { 'x y': { sci: 'x y' } },
  settings: { hour: 9, minute: 0 },
  nextNid: 3, place: null, climate: { avgTemp: 1 }, keys: { plantnet: 'SECRETA' },
});

test('el respaldo no lleva claves ni clima', () => {
  const b = buildBackup(cur(), new Date(2026, 9, 15));
  assert.equal(b.app, 'plantas');
  assert.ok(!JSON.stringify(b).includes('SECRETA'));
  assert.equal(b.data.climate, undefined);
  assert.equal(backupFileName(new Date(2026, 9, 5)), 'plantas-respaldo-2026-10-05.json');
});

test('ida y vuelta y validaciones', () => {
  const r = parseBackup(JSON.stringify(buildBackup(cur())));
  assert.ok(r.ok);
  assert.deepEqual(summarize(r.backup.data), { plants: 2, projects: 0, species: 1, photos: 1 });
  assert.equal(parseBackup('no json').ok, false);
  assert.equal(parseBackup('{"app":"otra","data":{}}').ok, false);
  assert.match(parseBackup('{"app":"plantas","version":99,"data":{"plants":[]}}').error, /más nueva/);
  assert.equal(parseBackup('{"app":"plantas","version":1,"data":{}}').ok, false);
  const sucio = parseBackup('{"app":"plantas","version":1,"data":{"plants":[null,{"x":1},{"id":"z","nid":5}]}}');
  assert.equal(sucio.backup.data.plants.length, 1);
});

test('reemplazar conserva la clave y evita choques de nid', () => {
  const inc = parseBackup(JSON.stringify(buildBackup({ ...cur(), plants: [{ id: 'q', nid: 7 }], nextNid: 2 }))).backup.data;
  const out = replaceWith(cur(), inc);
  assert.equal(out.keys.plantnet, 'SECRETA');
  assert.deepEqual(out.plants.map((p) => p.id), ['q']);
  assert.equal(out.nextNid, 8);
});

test('sumar: no duplica y reasigna nid', () => {
  const inc = { plants: [{ id: 'a', nid: 1 }, { id: 'n', nid: 1 }], species: { 'x y': { sci: 'nuevo' }, 'z w': { sci: 'z w' } }, settings: {}, place: null, nextNid: 2 };
  const { data, added, skipped } = mergeWith(cur(), inc);
  assert.equal(added, 1);
  assert.equal(skipped, 1);
  assert.equal(data.plants.find((p) => p.id === 'n').nid, 3);
  assert.equal(data.nextNid, 4);
  assert.equal(data.species['x y'].sci, 'x y'); // gana lo local
  assert.ok(data.species['z w']);
  assert.equal(new Set(data.plants.map((p) => p.nid)).size, 3);
});

test('recordatorio de respaldo', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  assert.equal(needsBackupReminder(0, null, now), false);
  assert.equal(needsBackupReminder(2, null, now), true);
  assert.equal(needsBackupReminder(2, '2026-10-10T12:00:00Z', now), false);
  assert.equal(needsBackupReminder(2, '2026-09-20T12:00:00Z', now), true);
  assert.equal(daysSinceBackup('basura', now), null);
  assert.match(lastBackupText('2026-10-12T12:00:00Z', now), /hace 3 días/);
  assert.match(lastBackupText(null, now), /Todavía no/);
});

test('los proyectos viajan en el respaldo y se suman sin duplicar', async () => {
  const { buildBackup, parseBackup, mergeWith, replaceWith } = await import('../src/backup.js');
  const { createProject, templateById } = await import('../src/projects.js');
  const plan = templateById('palta').build();
  const j = createProject({ name: 'Palta', startDate: '2026-10-01', plan });
  const cur = { plants: [], projects: [], species: {}, settings: {}, nextNid: 1 };
  const r = parseBackup(JSON.stringify(buildBackup({ ...cur, projects: [j] })));
  assert.equal(r.backup.data.projects.length, 1);
  const m = mergeWith({ ...cur, projects: [j] }, r.backup.data);
  assert.equal(m.data.projects.length, 1);
  assert.equal(m.addedProjects, 0);
  assert.equal(replaceWith(cur, r.backup.data).projects.length, 1);
  assert.equal(mergeWith(cur, r.backup.data).data.projects.length, 1);
});
