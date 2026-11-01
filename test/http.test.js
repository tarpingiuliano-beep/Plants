import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFetch } from '../src/http.js';

test('GET va por el plugin nativo y devuelve algo con forma de fetch', async () => {
  const calls = [];
  const native = { request: async (o) => (calls.push(o), { status: 200, headers: { 'content-type': 'application/json' }, data: { ok: 1 } }) };
  const f = makeFetch(native, async () => assert.fail('no debía usar fetch'));
  const r = await f('https://x.test/a', { headers: { 'x-goog-api-key': 'k' } });
  assert.equal(r.ok, true);
  assert.deepEqual(await r.json(), { ok: 1 });
  assert.equal(calls[0].headers['x-goog-api-key'], 'k');
  assert.equal(calls[0].method, 'GET');
});

test('errores: 404 con texto, y json desde texto', async () => {
  const native = { request: async () => ({ status: 404, headers: {}, data: '<html>no</html>' }) };
  const r = await makeFetch(native, null)('https://x.test');
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(await r.text(), '<html>no</html>');
  const j = await makeFetch({ request: async () => ({ status: 200, headers: {}, data: '{"a":2}' }) }, null)('https://x.test');
  assert.deepEqual(await j.json(), { a: 2 });
});

test('POST y sin plugin nativo usan fetch normal', async () => {
  let used = 0;
  const fb = async () => (used++, { ok: true });
  await makeFetch({ request: async () => assert.fail('no') }, fb)('https://x.test', { method: 'POST', body: '{}' });
  await makeFetch(null, fb)('https://x.test');
  assert.equal(used, 2);
});
