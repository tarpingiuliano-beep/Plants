import { test, expect, vi } from 'vitest';

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const today = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayN = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

test('flujo: ubicación, identificación, cuidados, base offline', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url, opts) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('data:')) return { blob: async () => new window.Blob(['x'], { type: 'image/jpeg' }) };
    if (u.includes('geocoding-api')) return new Response(JSON.stringify({ results: [{ name: 'Venado Tuerto', admin1: 'Santa Fe', country: 'Argentina', latitude: -33.74, longitude: -61.97 }] }));
    if (u.includes('api.open-meteo.com')) return new Response(JSON.stringify({ daily: {
      time: [0,1,2,3,4,5,6].map(dayN),
      temperature_2m_max: [18,17,19,20,21,22,22],
      temperature_2m_min: [2,3,8,9,10,11,11],
      precipitation_sum: [0,0,0,0,0,0,0] } }));
    if (u.includes('my-api.plantnet.org')) return new Response(JSON.stringify({ results: [
      { score: 0.91, species: { scientificNameWithoutAuthor: 'Ocimum basilicum', commonNames: ['Albahaca'], genus: { scientificNameWithoutAuthor: 'Ocimum' }, family: { scientificNameWithoutAuthor: 'Lamiaceae' } } },
      { score: 0.05, species: { scientificNameWithoutAuthor: 'Mentha spicata', commonNames: ['Hierbabuena'], genus: { scientificNameWithoutAuthor: 'Mentha' }, family: { scientificNameWithoutAuthor: 'Lamiaceae' } } } ] }));
    if (u.includes('wikipedia.org')) return new Response(JSON.stringify({ type: 'standard', extract: 'La albahaca es una planta aromática de la familia de las lamiáceas.' }));
    return new Response('{}', { status: 404 });
  });
  window.scrollTo = () => {};
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  window.confirm = () => true;
  document.body.innerHTML = '<div id="app"></div><div id="toast"></div>';
  await import('../src/main.js');
  await wait(50);
  const app = document.getElementById('app');
  expect(app.textContent).toContain('Sacale una foto a tu primera planta');
  expect(app.textContent).toContain('Elegí dónde vivís');

  // Ajustes: clave + ciudad
  location.hash = '#/ajustes'; await wait();
  const key = document.getElementById('s-key'); key.value = 'MI-CLAVE'; key.dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('city-q').value = 'Venado'; app.querySelector('[data-action="search-city"]').click(); await wait();
  app.querySelector('[data-action="pick-city"]').click(); await wait(80);
  expect(JSON.parse(localStorage.getItem('plantas.v1')).keys.plantnet).toBe('MI-CLAVE');
  expect(JSON.parse(localStorage.getItem('plantas.v1')).climate.minNext3).toBe(2);
  expect(app.textContent).toContain('Venado Tuerto');

  // Nueva planta: simulamos la foto ya tomada (jsdom no tiene cámara/canvas)
  location.hash = '#/new'; await wait();
  const input = document.getElementById('photo-input');
  const file = new File([new Uint8Array([255, 216, 255])], 'x.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(200);
  expect(app.textContent).toContain('¿Cuál es?');
  expect(app.textContent).toContain('91% de coincidencia');
  expect(document.getElementById('f-name').value).toBe('Albahaca');
  expect(app.textContent).toContain('Cuidados recomendados');
  expect(app.textContent).toContain('Frecuencia automática');
  expect(calls.some((c) => c.includes('api-key=MI-CLAVE'))).toBe(true);

  // Elegir otra candidata cambia nombre y especie; volver a la primera
  app.querySelectorAll('.cand')[1].click(); await wait();
  expect(document.getElementById('f-name').value).toBe('Hierbabuena');
  expect(document.getElementById('f-species').value).toBe('Mentha spicata');
  app.querySelectorAll('.cand')[0].click(); await wait();
  expect(document.getElementById('f-name').value).toBe('Albahaca');

  // Cambiar el lugar actualiza la frecuencia sin romper el form
  const before = app.querySelector('.auto-box b').textContent;
  app.querySelector('[data-id="jardin"]').click(); await wait();
  const after = app.querySelector('.auto-box b').textContent;
  expect(after).not.toBe(before);
  expect(app.textContent).toContain('No tolera el frío'); // albahaca afuera

  document.getElementById('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await wait(100);
  const st = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(st.plants).toHaveLength(1);
  expect(st.plants[0].sci).toBe('Ocimum basilicum');
  expect(st.plants[0].auto).toBe(true);
  expect(st.plants[0].placement).toBe('jardin');
  expect(st.species['Ocimum basilicum']).toBeTruthy();
  expect(st.species['Ocimum basilicum'].wiki).toContain('albahaca');

  // Lista: aviso de frío (mín 2 °C < 10 °C que tolera la albahaca)
  location.hash = '#/'; await wait();
  expect(app.textContent).toContain('Entrá o cubrí');
  expect(app.textContent).toContain('Albahaca');

  // Detalle con ficha de cuidados y wiki
  app.querySelector('[data-action="open"]').click(); await wait();
  expect(app.textContent).toContain('Cuidados recomendados');
  expect(app.textContent).toContain('lamiáceas');

  // Sin conexión: agregar planta a mano desde la base offline
  location.hash = '#/new'; await wait();
  document.getElementById('f-species').value = 'costilla de adan';
  document.getElementById('f-species').dispatchEvent(new Event('change', { bubbles: true })); await wait();
  expect(document.getElementById('f-name').value).toBe('Monstera');
  expect(app.textContent).toContain('Cuidados recomendados');
  document.getElementById('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await wait(50);
  expect(JSON.parse(localStorage.getItem('plantas.v1')).plants).toHaveLength(2);

  // Especie inventada: no ensucia la base
  location.hash = '#/new'; await wait();
  document.getElementById('f-species').value = 'Pepita';
  document.getElementById('f-species').dispatchEvent(new Event('change', { bubbles: true })); await wait();
  expect(app.textContent).toContain('estimación general');
  document.getElementById('f-name').value = 'La de mamá';
  document.getElementById('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await wait(50);
  const st2 = JSON.parse(localStorage.getItem('plantas.v1'));
  expect(st2.plants).toHaveLength(3);
  expect(st2.species['Pepita']).toBeUndefined();

  // Ajustes muestra la base
  location.hash = '#/ajustes'; await wait();
  expect(app.textContent).toContain('Mi base de plantas');
  expect(app.textContent).toContain('Ocimum basilicum');
});
