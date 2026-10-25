import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { loadAsync, save, flushNow, storageBackend, defaultState } = await import('../src/store.js');

test('migra de localStorage a IndexedDB sin perder nada y borra el original', async () => {
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(200000);
  const old = { ...defaultState(), plants: [{ id: 'a', name: 'Palmera', photo }], nextNid: 5, keys: { plantnet: 'K', gemini: '', geminiModel: '' } };
  mem.set('plantas.v1', JSON.stringify(old));
  const s = await loadAsync();
  assert.equal(storageBackend(), 'idb');
  assert.equal(s.plants[0].photo, photo);
  assert.equal(s.keys.plantnet, 'K');
  assert.equal(mem.has('plantas.v1'), false);
});

test('guarda en IndexedDB, soporta mucho más de 5 MB y se vuelve a leer', async () => {
  const s = await loadAsync();
  const big = 'data:image/jpeg;base64,' + 'B'.repeat(1_000_000);
  s.plants = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, photo: big })); // ~12 MB
  assert.equal(save(s), true);
  await flushNow();
  const again = await loadAsync();
  assert.equal(again.plants.length, 12);
  assert.equal(again.plants[11].photo.length, big.length);
  assert.equal(mem.has('plantas.v1'), false);
});

test('el guardado junta cambios seguidos y guarda el último estado', async () => {
  const s = await loadAsync();
  s.nextNid = 10;
  save(s);
  s.nextNid = 11;
  save(s);
  await flushNow();
  assert.equal((await loadAsync()).nextNid, 11);
});
