import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('foto mal reconocida: escribo el nombre yo', async () => {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.startsWith('data:')) return { blob: async () => new window.Blob(['x'], { type: 'image/jpeg' }) };
    if (u.includes('my-api.plantnet.org')) return new Response(JSON.stringify({ results: [
      { score: 0.4, species: { scientificNameWithoutAuthor: 'Mentha spicata', commonNames: ['Hierbabuena'], genus: { scientificNameWithoutAuthor: 'Mentha' }, family: { scientificNameWithoutAuthor: 'Lamiaceae' } } } ] }));
    return new Response('{}', { status: 404 });
  });
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  localStorage.setItem('plantas.v1', JSON.stringify({ plants: [], nextNid: 1, keys: { plantnet: 'K' } }));
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  location.hash = '#/new'; await wait();
  const input = document.getElementById('photo-input');
  Object.defineProperty(input, 'files', { value: [new File([new Uint8Array([255, 216, 255])], 'x.jpg', { type: 'image/jpeg' })] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(200);
  expect(document.getElementById('f-name').value).toBe('Hierbabuena');

  app.querySelector('[data-action="not-these"]').click(); await wait();
  expect(app.textContent).toContain('Escribí abajo el nombre');
  expect(app.querySelectorAll('.cand').length).toBe(0);
  expect(document.getElementById('f-species').value).toBe('');
  expect(document.getElementById('f-name').value).toBe('');

  const sp = document.getElementById('f-species');
  sp.value = 'zamioculca rarísima';
  sp.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  expect(document.getElementById('f-name').value).toBe('Zamioculca rarísima');

  document.getElementById('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await wait(100);
  const s = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(s.plants[0].species).toBe('Zamioculca rarísima');
  expect(s.plants[0].name).toBe('Zamioculca rarísima');
});
