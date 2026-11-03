import test from 'node:test';
import assert from 'node:assert/strict';
import { gemPost } from '../src/ai.js';

const R = (status) => ({ ok: status < 300, status });

test('reintenta ante 503 y devuelve el éxito', async () => {
  const seq = [503, 503, 200];
  let n = 0;
  const res = await gemPost('m', 'k', '{}', { waits: [1, 1, 1], f: async () => R(seq[n++]) });
  assert.equal(res.status, 200);
  assert.equal(n, 3);
});

test('si sigue saturado prueba el modelo liviano', async () => {
  const urls = [];
  const f = async (u) => (urls.push(u), R(u.includes('lite') ? 200 : 503));
  const res = await gemPost('m', 'k', '{}', { waits: [1], f });
  assert.equal(res.status, 200);
  assert.ok(urls.at(-1).includes('gemini-flash-lite-latest'));
});

test('no reintenta errores que no son de saturación', async () => {
  let n = 0;
  const res = await gemPost('m', 'k', '{}', { waits: [1, 1], f: async () => (n++, R(400)) });
  assert.equal(res.status, 400);
  assert.equal(n, 1);
});
