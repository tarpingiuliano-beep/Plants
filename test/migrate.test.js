import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshCare } from '../src/migrate.js';
import { lookup } from '../src/species.js';

test('al mejorar la base, las plantas automáticas se actualizan y las manuales no', () => {
  const old = lookup('Planta inventada');
  const data = {
    species: { 'Impatiens hawkeri': { sci: 'Impatiens hawkeri', names: [], care: { ...old, days: 7 }, wiki: 'ficha' } },
    plants: [
      { id: 'a', sci: 'Impatiens hawkeri', genus: 'Impatiens', family: 'Balsaminaceae', auto: true, baseDays: 7, everyDays: 8 },
      { id: 'b', sci: 'Impatiens hawkeri', genus: 'Impatiens', family: 'Balsaminaceae', auto: false, baseDays: 0, everyDays: 10 },
      { id: 'c', sci: '', auto: true, baseDays: 5 },
    ],
  };
  const r = refreshCare(data, lookup);
  assert.equal(r.plants[0].baseDays, 3);
  assert.equal(r.plants[1].everyDays, 10);
  assert.equal(r.plants[1].baseDays, 0);
  assert.equal(r.plants[2].baseDays, 5);
  assert.equal(data.species['Impatiens hawkeri'].care.days, 3);
  assert.equal(data.species['Impatiens hawkeri'].wiki, 'ficha');
  assert.equal(r.changed, 1);
});

test('lo consultado a la IA no se pisa con la tabla', () => {
  const ai = { ...lookup('x'), days: 2, source: 'IA' };
  const data = {
    species: { 'Foo bar': { sci: 'Foo bar', names: [], care: ai } },
    plants: [{ id: 'a', sci: 'Foo bar', auto: true, baseDays: 2 }],
  };
  const r = refreshCare(data, lookup);
  assert.equal(data.species['Foo bar'].care.source, 'IA');
  assert.equal(r.plants[0].baseDays, 2);
});
