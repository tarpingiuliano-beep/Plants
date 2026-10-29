import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('respaldo: aviso, guardar, restaurar (sumar y reemplazar)', async () => {
  window.scrollTo = () => {};
  window.confirm = () => true;
  const plant = (id, nid, name) => ({ id, nid, name, species: '', photo: '', everyDays: 7, lastWatered: '2026-10-10', history: [] });
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [plant('a', 1, 'Palmera')], nextNid: 2, keys: { plantnet: 'SECRETA' },
  }));
  let downloaded;
  URL.createObjectURL = (b) => { downloaded = b; return 'blob:x'; };
  window.HTMLAnchorElement.prototype.click = () => {};
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  expect(app.textContent).toContain('Todavía no hiciste un respaldo');

  location.hash = '#/ajustes'; await wait();
  expect(app.textContent).toContain('1 plantas');
  app.querySelector('[data-action="backup-save"]').click(); await wait(80);
  expect(app.textContent).toContain('Respaldo descargado');
  const text = await downloaded.text();
  expect(text).not.toContain('SECRETA');
  expect(JSON.parse(localStorage.getItem('plantas.v1')).lastBackup).toBeTruthy();

  // Restaurar un archivo con 2 plantas (una repetida)
  const file = new File([JSON.stringify({
    app: 'plantas', version: 1, exportedAt: new Date().toISOString(),
    data: { plants: [plant('a', 1, 'Palmera'), plant('b', 1, 'Aguacate')], species: {}, settings: {}, nextNid: 2 },
  })], 'r.json', { type: 'application/json' });
  const input = document.getElementById('backup-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true })); await wait(80);
  expect(app.textContent).toContain('2 plantas, 0 proyectos y 0 especies');
  app.querySelector('[data-action="restore-merge"]').click(); await wait(50);
  let s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.plants.map((p) => p.name)).toEqual(['Palmera', 'Aguacate']);
  expect(s.plants[1].nid).toBe(2);
  expect(s.keys.plantnet).toBe('SECRETA');
  expect(app.textContent).toContain('1 ya estaban');

  // Archivo inválido
  const bad = new File(['hola'], 'x.json');
  const input2 = document.getElementById('backup-input');
  Object.defineProperty(input2, 'files', { value: [bad], configurable: true });
  input2.dispatchEvent(new Event('change', { bubbles: true })); await wait(80);
  expect(app.textContent).toContain('no se puede leer');
});
