import test from 'node:test';
import assert from 'node:assert/strict';
import { toBase64Utf8, validRepo, cloudDue, pushBackup, pullBackup, explain } from '../src/cloud.js';
import { buildBackup } from '../src/backup.js';

const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

test('base64 UTF-8 y validación de repo', () => {
  assert.equal(Buffer.from(toBase64Utf8('Ñandú 🌱'), 'base64').toString('utf8'), 'Ñandú 🌱');
  assert.ok(validRepo('tarpingiuliano-beep/Plantas-respaldo'));
  assert.ok(!validRepo('sin-barra'));
  assert.ok(!validRepo('a/b/c'));
});

test('cuándo toca el respaldo automático', () => {
  const keys = { github: 't', githubRepo: 'a/b' };
  const now = new Date('2026-11-02T12:00:00Z');
  assert.equal(cloudDue(keys, null, now), true);
  assert.equal(cloudDue(keys, '2026-11-02T01:00:00Z', now), false);
  assert.equal(cloudDue(keys, '2026-11-01T10:00:00Z', now), true);
  assert.equal(cloudDue({ github: '', githubRepo: 'a/b' }, null, now), false);
  assert.equal(cloudDue(keys, null, now, false), false);
});

test('subir: crea si no existe y actualiza con sha si existe', async () => {
  const calls = [];
  const f1 = async (url, o = {}) => (calls.push([o.method || 'GET', url, o.body]), o.method === 'PUT' ? resp(201, {}) : resp(404, { message: 'Not Found' }));
  assert.deepEqual(await pushBackup({ token: 't', repo: 'a/b', text: '{"x":1}' }, f1), { ok: true });
  assert.equal(JSON.parse(calls[1][2]).sha, undefined);
  assert.equal(Buffer.from(JSON.parse(calls[1][2]).content, 'base64').toString(), '{"x":1}');
  const calls2 = [];
  const f2 = async (url, o = {}) => (calls2.push(o.body), o.method === 'PUT' ? resp(200, {}) : resp(200, { sha: 'abc' }));
  await pushBackup({ token: 't', repo: 'a/b', text: 'y' }, f2);
  assert.equal(JSON.parse(calls2[1]).sha, 'abc');
});

test('errores claros', async () => {
  const bad = await pushBackup({ token: 't', repo: 'a/b', text: 'x' }, async () => resp(401, { message: 'Bad credentials' }));
  assert.match(bad.error, /no aceptó el token/);
  assert.match(explain(404), /repositorio/);
  const net = await pushBackup({ token: 't', repo: 'a/b', text: 'x' }, async () => { throw new Error('x'); });
  assert.match(net.error, /conectarme/);
});

test('bajar: lee un respaldo válido y avisa si no hay', async () => {
  const text = JSON.stringify(buildBackup({ plants: [{ id: 'p1', name: 'A', history: [] }], species: {}, settings: {}, nextNid: 2 }));
  const ok = await pullBackup({ token: 't', repo: 'a/b' }, async () => resp(200, text));
  assert.ok(ok.ok);
  assert.equal(ok.backup.data.plants.length, 1);
  const none = await pullBackup({ token: 't', repo: 'a/b' }, async () => resp(404, { message: 'Not Found' }));
  assert.match(none.error, /Todavía no hay/);
});
