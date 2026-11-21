import { test, expect } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('crecimiento: aparece en "Para hoy", se guarda la medida y se reprograma', async () => {
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  localStorage.setItem('plantas.v1', JSON.stringify({
    plants: [
      { id: 'a', nid: 1, name: 'Palma', sci: 'Chamaedorea elegans', placement: 'interior-luz', photo: '', everyDays: 7, lastWatered: d(0), history: [], tasks: [], track: { every: 30, next: d(0), on: true } },
      { id: 'b', nid: 2, name: 'Violeta', sci: '', placement: 'interior-luz', photo: '', everyDays: 7, lastWatered: d(0), history: [], tasks: [] },
    ],
    nextNid: 3, keys: {},
  }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(80);
  const app = document.getElementById('app');
  // la que ya tenía seguimiento pide hoy; la otra recibe uno por defecto, repartido (no hoy)
  expect(app.textContent).toContain('Medir y sacar foto');
  const s0 = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s0.plants[1].track.every).toBe(30);
  expect(s0.plants[1].track.next > d(0)).toBe(true);

  document.querySelector('[data-action="grow-open"][data-id="a"]').click(); await wait();
  expect(location.hash).toBe('#/p/a');
  expect(document.getElementById('grow-box').open).toBe(true);
  document.querySelector('[data-action="grow-save"]').click(); await wait();
  expect(document.getElementById('toast').textContent).toContain('Cargá la altura o una foto');
  document.getElementById('g-cm').value = '32.5';
  document.getElementById('g-note').value = 'hoja nueva';
  document.querySelector('[data-action="grow-save"]').click(); await wait();
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.plants[0].growth[0]).toMatchObject({ cm: 32.5, note: 'hoja nueva', date: d(0) });
  expect(s.plants[0].track.next).toBe(d(30));
  expect(app.textContent).toContain('32.5 cm');

  location.hash = '#/'; await wait();
  expect(app.textContent).not.toContain('Medir y sacar foto');
});
