import './styles.css';
import { load, save } from './store.js';
import {
  dateStr,
  nextDue,
  waterStatus,
  statusText,
  sortPlants,
  newPlant,
  waterPlant,
  addNote,
} from './logic.js';
import {
  isNative,
  permissionState,
  askPermission,
  setupChannel,
  reschedule,
  onNotificationTap,
  sendTest,
} from './notifications.js';

let data = load();
let perm = 'unsupported';
let formPhoto = '';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

/* ---------- utilidades ---------- */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};
const fmtWhen = (iso) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2400);
}

function persist() {
  if (!save(data)) toast('⚠️ No hay espacio para guardar. Probá con fotos más chicas.');
  reschedule(data.plants, data.settings);
}

const getPlant = (id) => data.plants.find((p) => p.id === id);
const go = (path, replace = false) => {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
};

/** Achica la foto para no llenar el almacenamiento */
function fileToDataURL(file, max = 720) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la foto'));
    };
    img.src = url;
  });
}

/* ---------- vistas ---------- */

function photoHtml(p, cls) {
  return p.photo ? `<img class="${cls}" src="${p.photo}" alt="" />` : `<div class="${cls}">🪴</div>`;
}

function viewList() {
  const today = dateStr();
  const plants = sortPlants(data.plants, today);
  const needsPerm = isNative() && perm !== 'granted';

  const banner = needsPerm
    ? `<div class="banner"><span>🔔 Activá las notificaciones para que te avise cuándo regar.</span>
         <button class="btn" data-action="ask-perm">Activar</button></div>`
    : '';

  const cards = plants
    .map((p) => {
      const st = waterStatus(p, today);
      const meta = [p.species, p.location].filter(Boolean).join(' · ');
      return `<div class="card plant-card" data-action="open" data-id="${p.id}">
        ${photoHtml(p, 'thumb')}
        <div class="info">
          <div class="name">${esc(p.name)}</div>
          ${meta ? `<div class="sub">${esc(meta)}</div>` : ''}
          <span class="chip ${st.state}">${statusText(st)}</span>
        </div>
        <button class="water-btn" data-action="water" data-id="${p.id}" aria-label="Regar ${esc(p.name)}">💧</button>
      </div>`;
    })
    .join('');

  const empty = `<div class="empty"><div class="big">🌱</div>
    <p><b>Todavía no cargaste plantas.</b></p>
    <p>Tocá el botón + para sumar la primera.</p></div>`;

  return `<div class="topbar"><h1>Mis plantas</h1>
      <button class="icon-btn" data-action="settings" aria-label="Ajustes">⚙️</button></div>
    ${banner}
    ${plants.length ? cards : empty}
    <button class="fab" data-action="new" aria-label="Agregar planta">+</button>`;
}

function viewDetail(p) {
  const today = dateStr();
  const st = waterStatus(p, today);
  const hist = p.history.length
    ? p.history
        .map(
          (h) => `<li><span>${h.type === 'riego' ? '💧' : '📝'}</span>
            <div><div>${h.type === 'riego' ? 'Riego' : esc(h.note)}${h.type === 'riego' && h.note ? ` — ${esc(h.note)}` : ''}</div>
            <div class="when">${fmtWhen(h.at)}</div></div></li>`,
        )
        .join('')
    : '<p class="sub">Todavía no hay registros.</p>';

  return `<div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Volver">←</button>
      <h1></h1>
      <button class="icon-btn" data-action="edit" data-id="${p.id}" aria-label="Editar">✏️</button></div>
    <div class="card">
      ${photoHtml(p, 'hero')}
      <div class="detail-body">
        <h1>${esc(p.name)}</h1>
        <div class="sub">${esc([p.species, p.location].filter(Boolean).join(' · ') || 'Sin detalles')}</div>
        <span class="chip ${st.state}">${statusText(st)}</span>
        <div class="facts">
          <div class="fact"><span class="sub">Frecuencia</span><b>Cada ${p.everyDays} ${p.everyDays === 1 ? 'día' : 'días'}</b></div>
          <div class="fact"><span class="sub">Último riego</span><b>${fmtDay(p.lastWatered)}</b></div>
          <div class="fact"><span class="sub">Próximo riego</span><b>${fmtDay(nextDue(p))}</b></div>
          <div class="fact"><span class="sub">Aviso</span><b>${pad(data.settings.hour)}:${pad(data.settings.minute)}</b></div>
        </div>
        <button class="btn blue block" data-action="water" data-id="${p.id}">💧 Ya la regué</button>
      </div>
    </div>
    <h2>Historial</h2>
    <div class="card" style="padding: 4px 16px"><ul class="history">${hist}</ul></div>
    <div class="row" style="margin-top: 12px">
      <input type="text" id="note" placeholder="Agregar nota (abono, poda, plaga…)" maxlength="140" />
      <button class="btn secondary" style="flex: none" data-action="add-note" data-id="${p.id}">Guardar</button>
    </div>`;
}

function viewForm(p) {
  const editing = !!p;
  formPhoto = p?.photo || '';
  return `<div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Volver">←</button>
      <h1>${editing ? 'Editar planta' : 'Nueva planta'}</h1></div>
    <form id="form" class="stack" autocomplete="off">
      <button type="button" class="photo-pick" id="photo-pick" data-action="pick-photo">
        ${formPhoto ? `<img src="${formPhoto}" alt="" />` : '<span>📷<br />Agregar foto</span>'}
      </button>
      <input type="file" id="photo-input" accept="image/*" hidden />
      <div><label for="f-name">Nombre *</label>
        <input type="text" id="f-name" required maxlength="40" value="${esc(p?.name || '')}" placeholder="Ej: Monstera del living" /></div>
      <div><label for="f-species">Especie</label>
        <input type="text" id="f-species" maxlength="40" value="${esc(p?.species || '')}" placeholder="Ej: Monstera deliciosa" /></div>
      <div><label for="f-location">Ubicación</label>
        <input type="text" id="f-location" maxlength="40" value="${esc(p?.location || '')}" placeholder="Ej: Balcón, living" /></div>
      <div class="row">
        <div><label for="f-every">Regar cada (días)</label>
          <input type="number" id="f-every" min="1" max="365" inputmode="numeric" value="${p?.everyDays ?? 7}" required /></div>
        <div><label for="f-last">Último riego</label>
          <input type="date" id="f-last" max="${dateStr()}" value="${p?.lastWatered ?? dateStr()}" required /></div>
      </div>
      <button class="btn block" type="submit" style="margin-top: 18px">${editing ? 'Guardar cambios' : 'Agregar planta'}</button>
      ${editing ? `<button class="btn danger block" type="button" data-action="delete" data-id="${p.id}">Eliminar planta</button>` : ''}
    </form>`;
}

function viewSettings() {
  const native = isNative();
  const permText = !native
    ? 'Las notificaciones funcionan solo en la app de Android.'
    : perm === 'granted'
      ? '✅ Notificaciones activadas'
      : perm === 'denied'
        ? '⛔ Bloqueadas. Activalas desde Ajustes de Android → Apps → Plantas → Notificaciones.'
        : '🔔 Todavía no diste permiso.';
  return `<div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Volver">←</button>
      <h1>Ajustes</h1></div>
    <div class="card" style="padding: 16px">
      <label for="s-time" style="margin-top: 0">Hora del aviso diario</label>
      <input type="time" id="s-time" value="${pad(data.settings.hour)}:${pad(data.settings.minute)}" />
      <p class="hint">Te aviso a esta hora el día que toca regar, y los 3 días siguientes si se te pasa.</p>
    </div>
    <div class="card" style="padding: 16px; margin-top: 12px">
      <p style="margin-top: 0">${permText}</p>
      <div class="stack">
        ${native && perm !== 'granted' ? '<button class="btn block" data-action="ask-perm">Activar notificaciones</button>' : ''}
        ${native && perm === 'granted' ? '<button class="btn secondary block" data-action="test-notif">Probar notificación (5 s)</button>' : ''}
      </div>
    </div>`;
}

/* ---------- router ---------- */

function render() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [, route, id] = hash.split('/');
  let html;
  if (route === 'p' && getPlant(id)) html = viewDetail(getPlant(id));
  else if (route === 'new') html = viewForm(null);
  else if (route === 'edit' && getPlant(id)) html = viewForm(getPlant(id));
  else if (route === 'ajustes') html = viewSettings();
  else html = viewList();
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

/* ---------- acciones ---------- */

async function refreshPerm() {
  perm = await permissionState();
}

async function doAskPerm() {
  perm = await askPermission();
  await reschedule(data.plants, data.settings);
  if (perm === 'granted') toast('Notificaciones activadas 🔔');
  render();
}

function doWater(id) {
  const p = getPlant(id);
  if (!p) return;
  data.plants = data.plants.map((x) => (x.id === id ? waterPlant(x) : x));
  persist();
  toast(`💧 Anotado. Próximo riego: ${fmtDay(nextDue(getPlant(id)))}`);
  render();
}

$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;

  if (action === 'water') {
    e.stopPropagation();
    return doWater(id);
  }
  if (action === 'open') return go(`/p/${id}`);
  if (action === 'new') return go('/new');
  if (action === 'edit') return go(`/edit/${id}`);
  if (action === 'settings') return go('/ajustes');
  if (action === 'back') return history.length > 1 ? history.back() : go('/', true);
  if (action === 'ask-perm') return doAskPerm();
  if (action === 'pick-photo') return document.getElementById('photo-input').click();

  if (action === 'add-note') {
    const input = document.getElementById('note');
    const text = input.value.trim();
    if (!text) return;
    data.plants = data.plants.map((x) => (x.id === id ? addNote(x, text) : x));
    persist();
    return render();
  }

  if (action === 'delete') {
    const p = getPlant(id);
    if (p && confirm(`¿Eliminar "${p.name}"? Se borra también su historial.`)) {
      data.plants = data.plants.filter((x) => x.id !== id);
      persist();
      toast('Planta eliminada');
      return go('/', true);
    }
  }

  if (action === 'test-notif') {
    const ok = await sendTest();
    toast(ok ? 'Te llega en 5 segundos. Podés salir de la app.' : 'No se pudo programar la prueba.');
  }
});

$app.addEventListener('change', async (e) => {
  if (e.target.id === 'photo-input' && e.target.files[0]) {
    try {
      formPhoto = await fileToDataURL(e.target.files[0]);
      document.getElementById('photo-pick').innerHTML = `<img src="${formPhoto}" alt="" />`;
    } catch (err) {
      toast(err.message);
    }
  }
  if (e.target.id === 's-time' && e.target.value) {
    const [h, m] = e.target.value.split(':').map(Number);
    data.settings = { ...data.settings, hour: h, minute: m };
    persist();
    toast(`Aviso a las ${pad(h)}:${pad(m)}`);
  }
});

$app.addEventListener('submit', (e) => {
  if (e.target.id !== 'form') return;
  e.preventDefault();
  const name = document.getElementById('f-name').value.trim();
  if (!name) return;
  const fields = {
    name,
    species: document.getElementById('f-species').value,
    location: document.getElementById('f-location').value,
    everyDays: document.getElementById('f-every').value,
    lastWatered: document.getElementById('f-last').value,
    photo: formPhoto,
  };

  const [, , editId] = (location.hash.replace(/^#/, '') || '/').split('/');
  const existing = location.hash.startsWith('#/edit/') ? getPlant(editId) : null;

  if (existing) {
    const everyDays = Math.max(1, Math.min(365, Number(fields.everyDays) || existing.everyDays));
    data.plants = data.plants.map((x) =>
      x.id === existing.id
        ? { ...x, ...fields, name, species: fields.species.trim(), location: fields.location.trim(), everyDays }
        : x,
    );
    persist();
    toast('Cambios guardados');
    return go(`/p/${existing.id}`, true);
  }

  const plant = newPlant({ ...fields, nid: data.nextNid });
  data.nextNid += 1;
  data.plants.push(plant);
  persist();
  toast('Planta agregada 🌿');
  go('/', true);
});

/* ---------- arranque ---------- */

(async function init() {
  await setupChannel();
  await refreshPerm();
  onNotificationTap((plantId) => {
    if (getPlant(plantId)) go(`/p/${plantId}`);
  });
  // Al abrir la app reprogramamos, así los avisos siempre reflejan el estado real.
  await reschedule(data.plants, data.settings);
  render();
})();
