import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('respaldo en GitHub: configurar, subir, restaurar y no filtrar claves', async () => {
  window.scrollTo = () => {};
  window.confirm = () => true;
  const plant = { id: 'a', nid: 1, name: 'Palmera', species: '', photo: '', everyDays: 7, lastWatered: '2026-10-10', history: [] };
  localStorage.setItem('plantas.v1', JSON.stringify({ plants: [plant], nextNid: 2, keys: { plantnet: 'SECRETA' } }));
  const calls = [];
  let stored = null;
  window.fetch = globalThis.fetch = async (url, o = {}) => {
    const method = o.method || 'GET';
    calls.push(method);
    const r = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), headers: { get: () => '' } });
    if (!String(url).includes('api.github.com')) return r(500, {});
    if (method === 'PUT') { stored = Buffer.from(JSON.parse(o.body).content, 'base64').toString('utf8'); return r(201, {}); }
    return stored ? r(200, stored) : r(404, { message: 'Not Found' });
  };
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  location.hash = '#/ajustes'; await wait();
  expect(app.textContent).toContain('Respaldo automático en GitHub');

  document.getElementById('s-grepo').value = 'malformado';
  app.querySelector('[data-action="cloud-save"]').click(); await wait(50);
  expect(app.textContent).toContain('usuario/nombre');

  document.getElementById('s-grepo').value = 'yo/respaldo';
  document.getElementById('s-gtoken').value = 'github_pat_TOKEN';
  app.querySelector('[data-action="cloud-save"]').click(); await wait(150);
  expect(app.textContent).toContain('Respaldo subido a GitHub');
  expect(stored).toContain('Palmera');
  expect(stored).not.toContain('SECRETA');
  expect(stored).not.toContain('github_pat_TOKEN');
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.keys.github).toBe('github_pat_TOKEN');
  expect(s.lastCloudBackup).toBeTruthy();

  app.querySelector('[data-action="cloud-restore"]').click(); await wait(150);
  expect(app.textContent).toContain('1 plantas, 0 proyectos');
  app.querySelector('[data-action="restore-replace"]').click(); await wait(50);
  const s2 = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s2.plants[0].name).toBe('Palmera');
  expect(s2.keys.github).toBe('github_pat_TOKEN');
});
