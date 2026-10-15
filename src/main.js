import './styles.css';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
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
  adjustedDays,
  buildColdAlerts,
  plantsAtColdRisk,
  COLD_ALERT_FROM,
} from './logic.js';
import { PLACEMENTS, placementOf, lookup, searchSpecies, allNames, advice, lightLabel } from './species.js';
import { fetchClimate, searchCity, identifyPlant, fetchWiki } from './net.js';
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
let draft = null; // borrador del formulario de planta
let cityResults = [];
let cityMsg = '';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

/* ---------- utilidades ---------- */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const fmtDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};
const fmtWhen = (iso) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const online = () => navigator.onLine !== false;

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

const route = () => location.hash.replace(/^#/, '') || '/';
const routeName = () => route().split('/')[1] || '';
const go = (path, replace = false) => {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
};

const getPlant = (id) => data.plants.find((p) => p.id === id);
const careOf = (p) => (p.sci ? data.species[p.sci]?.care || lookup(p.sci, p.genus, p.family) : null);

/** Avisos de helada/frío para las notificaciones */
const extraAlerts = () => buildColdAlerts(data.plants, data.climate, careOf, placementOf);

function persist({ resched = true } = {}) {
  if (!save(data)) toast('⚠️ No hay espacio para guardar. Probá con fotos más chicas.');
  if (resched) reschedule(data.plants, data.settings, extraAlerts());
}

/** Achica una foto (data URL) para no llenar el almacenamiento */
function shrink(dataUrl, max = 720) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.78));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    setTimeout(() => resolve(dataUrl), 4000); // por si el WebView no dispara ningún evento
    img.src = dataUrl;
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('No se pudo leer la foto'));
    r.readAsDataURL(file);
  });
}

/* ---------- clima, base de especies y sincronización ---------- */

/** Recalcula la frecuencia de las plantas en modo automático */
function applyClimate() {
  const t = data.climate?.avgTemp;
  data.plants = data.plants.map((p) =>
    p.auto && p.baseDays ? { ...p, everyDays: adjustedDays(p.baseDays, placementOf(p.placement), t) } : p,
  );
}

async function refreshClimate(force = false) {
  if (!data.place || !online()) return;
  const c = data.climate;
  if (!force && c && Date.now() - c.fetchedAt < 3 * 3600 * 1000) return;
  try {
    data.climate = await fetchClimate(data.place);
    applyClimate();
    persist();
    if (['', 'p'].includes(routeName())) render();
  } catch (e) {
    console.warn(e);
  }
}

/** Completa con wifi la info de las especies que se fueron sumando */
async function syncSpecies() {
  if (!online()) return;
  let changed = false;
  for (const sp of Object.values(data.species)) {
    const recently = sp.wikiTried && Date.now() - sp.wikiTried < 7 * 86400000;
    if (sp.wiki || recently) continue;
    sp.wikiTried = Date.now();
    const w = await fetchWiki(sp.sci);
    if (w) sp.wiki = w.text;
    changed = true;
  }
  if (changed) {
    persist({ resched: false });
    if (['p', 'ajustes'].includes(routeName())) render();
  }
}

async function syncOnline() {
  await refreshClimate();
  await syncSpecies();
}

function rememberSpecies(sci, genus, family) {
  if (!sci || data.species[sci]) return;
  const care = lookup(sci, genus, family);
  data.species[sci] = { sci, names: care.names, care, wiki: '', addedAt: Date.now() };
}

/* ---------- borrador del formulario ---------- */

function newDraft(p) {
  if (!p) {
    return {
      id: '', photo: '', full: '', sci: '', genus: '', family: '', speciesText: '', name: '', nameTouched: false,
      placement: 'interior-luz', auto: true, everyDays: 7, lastWatered: dateStr(),
      candidates: [], status: 'idle', msg: '',
    };
  }
  return {
    id: p.id, photo: p.photo, full: '', sci: p.sci || '', genus: p.genus || '', family: p.family || '',
    speciesText: p.sci || p.species || '', name: p.name, nameTouched: true,
    placement: p.placement || 'interior-luz', auto: !!p.auto, everyDays: p.everyDays, lastWatered: p.lastWatered,
    candidates: [], status: 'idle', msg: '',
  };
}

function syncDraft() {
  if (!draft) return;
  const v = (id) => document.getElementById(id);
  if (v('f-name')) {
    if (v('f-name').value !== draft.name) draft.nameTouched = true;
    draft.name = v('f-name').value;
  }
  if (v('f-species')) draft.speciesText = v('f-species').value;
  if (v('f-every')) draft.everyDays = v('f-every').value;
  if (v('f-last')) draft.lastWatered = v('f-last').value;
  if (v('f-auto')) draft.auto = v('f-auto').checked;
}

const draftCare = () => (draft?.sci ? lookup(draft.sci, draft.genus, draft.family) : null);

function pickCandidate(i) {
  const c = draft.candidates[i];
  if (!c) return;
  draft.sci = c.sci;
  draft.genus = c.genus;
  draft.family = c.family;
  draft.speciesText = c.sci;
  if (!draft.nameTouched || !draft.name) {
    draft.name = c.common || c.sci;
    draft.nameTouched = false;
  }
}

function resolveManualSpecies() {
  const text = draft.speciesText.trim();
  if (!text) {
    draft.sci = '';
    draft.genus = '';
    draft.family = '';
    return;
  }
  const hit = searchSpecies(text)[0];
  if (hit) {
    draft.sci = hit.sci.charAt(0).toUpperCase() + hit.sci.slice(1);
    draft.genus = '';
    draft.family = '';
    if (!draft.nameTouched || !draft.name) {
      draft.name = hit.names[0] || draft.sci;
      draft.nameTouched = false;
    }
  } else {
    draft.sci = text;
    draft.genus = '';
    draft.family = '';
  }
}

async function takePhoto() {
  syncDraft();
  let full = '';
  if (isNative()) {
    try {
      const ph = await Camera.getPhoto({
        quality: 80,
        width: 1024,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        promptLabelHeader: 'Foto de la planta',
        promptLabelPhoto: 'Elegir de la galería',
        promptLabelPicture: 'Sacar foto',
        promptLabelCancel: 'Cancelar',
      });
      full = ph.dataUrl || '';
    } catch {
      return; // canceló
    }
  } else {
    document.getElementById('photo-input')?.click();
    return;
  }
  await onPhoto(full);
}

async function onPhoto(full) {
  if (!full) return;
  draft.full = full;
  draft.photo = await shrink(full, 720);
  draft.candidates = [];
  draft.msg = '';
  await identify();
}

async function identify() {
  if (!draft?.full) return;
  if (!data.keys.plantnet) {
    draft.status = 'nokey';
    return render();
  }
  if (!online()) {
    draft.status = 'offline';
    return render();
  }
  draft.status = 'identifying';
  render();
  try {
    draft.candidates = await identifyPlant(draft.full, data.keys.plantnet);
    if (draft.candidates.length) {
      draft.status = 'done';
      pickCandidate(0);
    } else {
      draft.status = 'nomatch';
    }
  } catch (e) {
    draft.status = 'error';
    draft.msg = e.message;
  }
  render();
}

/* ---------- vistas ---------- */

const photoHtml = (p, cls) =>
  p.photo ? `<img class="${cls}" src="${p.photo}" alt="" />` : `<div class="${cls}">🪴</div>`;

function weatherLine() {
  const c = data.climate;
  if (!data.place) return '';
  if (!c) return `📍 ${esc(data.place.name)}`;
  return `📍 ${esc(data.place.name)} · ${Math.round(c.avgTemp)} °C de media esta semana`;
}

function viewList() {
  const today = dateStr();
  const plants = sortPlants(data.plants, today);
  const banners = [];

  if (isNative() && perm !== 'granted') {
    banners.push(`<div class="banner"><span>🔔 Activá las notificaciones para que te avise cuándo regar.</span>
      <button class="btn" data-action="ask-perm">Activar</button></div>`);
  }
  if (!data.place) {
    banners.push(`<div class="banner"><span>📍 Elegí dónde vivís y ajusto el riego al clima de tu zona.</span>
      <button class="btn" data-action="settings">Elegir</button></div>`);
  }
  const c = data.climate;
  if (c) {
    const days = c.days.slice(0, 3).filter((d) => d.min <= COLD_ALERT_FROM);
    const worst = days.reduce((m, d) => (!m || d.min < m.min ? d : m), null);
    if (worst) {
      const risk = plantsAtColdRisk(data.plants, worst.min, careOf, placementOf);
      if (risk.length) {
        banners.push(`<div class="banner cold"><span>${worst.min <= 0 ? '❄️ Helada' : '🥶 Frío'} el ${fmtDay(worst.date)}
          (mínima ${Math.round(worst.min)} °C). Entrá o cubrí: <b>${risk.map((p) => esc(p.name)).join(', ')}</b></span></div>`);
      }
    }
    if (c.rainToday >= 5) {
      const wet = plants.filter((p) => placementOf(p.placement).outdoor && waterStatus(p, today).days <= 0);
      if (wet.length) {
        banners.push(`<div class="banner rain"><span>🌧️ Hoy llueve (${Math.round(c.rainToday)} mm): no hace falta regar
          <b>${wet.map((p) => esc(p.name)).join(', ')}</b>.</span></div>`);
      }
    }
  }

  const cards = plants
    .map((p) => {
      const st = waterStatus(p, today);
      const meta = [p.species || p.sci, placementOf(p.placement).label].filter(Boolean).join(' · ');
      return `<div class="card plant-card" data-action="open" data-id="${p.id}">
        ${photoHtml(p, 'thumb')}
        <div class="info">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${esc(meta)}</div>
          <span class="chip ${st.state}">${statusText(st)}</span>
        </div>
        <button class="water-btn" data-action="water" data-id="${p.id}" aria-label="Regar ${esc(p.name)}">💧</button>
      </div>`;
    })
    .join('');

  const empty = `<div class="empty"><div class="big">📷</div>
    <p><b>Sacale una foto a tu primera planta.</b></p>
    <p>La reconozco y te digo cómo cuidarla.</p></div>`;

  return `<div class="topbar"><h1>Mis plantas</h1>
      <button class="icon-btn" data-action="settings" aria-label="Ajustes">⚙️</button></div>
    ${data.place ? `<p class="sub" style="margin: -6px 0 12px">${weatherLine()}</p>` : ''}
    ${banners.join('')}
    ${plants.length ? cards : empty}
    <button class="fab" data-action="new" aria-label="Agregar planta">+</button>`;
}

function careCardHtml(care, placement, extra = {}) {
  if (!care) return '';
  const lines = advice(care, placement);
  const t = data.climate?.avgTemp;
  const days = adjustedDays(care.days, placement, t);
  const srcText = {
    especie: 'datos de la especie',
    género: 'datos del género (aproximado)',
    familia: 'datos de la familia (aproximado)',
    genérico: 'estimación general',
  }[care.source];
  return `<div class="card care">
      <div class="care-head">
        <b>Cuidados recomendados</b>
        <span class="sub">${esc(srcText)}</span>
      </div>
      <div class="care-grid">
        <div>💧 <b>Cada ${days} ${days === 1 ? 'día' : 'días'}</b><span class="sub">${
          Number.isFinite(t) ? `ajustado a ${Math.round(t)} °C y a su lugar` : 'sin datos de clima todavía'
        }</span></div>
        <div>💡 <b>${esc(lightLabel(care.light))}</b></div>
        <div>🌡️ <b>Aguanta hasta ${care.minTemp} °C</b></div>
        <div>💨 <b>Humedad ${esc(care.humidity)}</b></div>
      </div>
      ${lines.length ? `<ul class="notes">${lines.map((l) => `<li>⚠️ ${esc(l)}</li>`).join('')}</ul>` : ''}
      ${care.tips.length ? `<ul class="notes">${care.tips.map((l) => `<li>🌱 ${esc(l)}</li>`).join('')}</ul>` : ''}
      ${extra.wiki ? `<p class="wiki">${esc(extra.wiki)}</p>` : ''}
    </div>`;
}

function viewDetail(p) {
  const today = dateStr();
  const st = waterStatus(p, today);
  const care = careOf(p);
  const sp = data.species[p.sci];
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
        <div class="sub">${esc([p.sci, placementOf(p.placement).label].filter(Boolean).join(' · '))}</div>
        <span class="chip ${st.state}">${statusText(st)}</span>
        <div class="facts">
          <div class="fact"><span class="sub">Frecuencia</span><b>Cada ${p.everyDays} ${p.everyDays === 1 ? 'día' : 'días'}</b>${
            p.auto ? '<span class="sub">automática</span>' : ''
          }</div>
          <div class="fact"><span class="sub">Último riego</span><b>${fmtDay(p.lastWatered)}</b></div>
          <div class="fact"><span class="sub">Próximo riego</span><b>${fmtDay(nextDue(p))}</b></div>
          <div class="fact"><span class="sub">Aviso</span><b>${pad(data.settings.hour)}:${pad(data.settings.minute)}</b></div>
        </div>
        <button class="btn blue block" data-action="water" data-id="${p.id}">💧 Ya la regué</button>
      </div>
    </div>
    ${care ? `<div style="margin-top: 12px">${careCardHtml(care, placementOf(p.placement), { wiki: sp?.wiki })}</div>` : ''}
    <h2>Historial</h2>
    <div class="card" style="padding: 4px 16px"><ul class="history">${hist}</ul></div>
    <div class="row" style="margin-top: 12px">
      <input type="text" id="note" placeholder="Agregar nota (abono, poda, plaga…)" maxlength="140" />
      <button class="btn secondary" style="flex: none" data-action="add-note" data-id="${p.id}">Guardar</button>
    </div>`;
}

function statusBox() {
  const d = draft;
  if (d.status === 'identifying') return '<div class="status">🔎 Identificando la planta…</div>';
  if (d.status === 'nokey')
    return `<div class="status warn">Para reconocerla por foto necesito tu clave gratuita de PlantNet.
      <button type="button" class="btn" data-action="settings">Cargarla</button></div>`;
  if (d.status === 'offline')
    return `<div class="status warn">Sin conexión: no puedo reconocerla ahora. Elegí la especie de la lista de abajo
      o probá de nuevo con wifi. <button type="button" class="btn" data-action="retry-id">Reintentar</button></div>`;
  if (d.status === 'nomatch')
    return '<div class="status warn">No reconocí una planta en esa foto. Probá con una hoja o flor de cerca, o elegí la especie abajo.</div>';
  if (d.status === 'error')
    return `<div class="status warn">${esc(d.msg)} <button type="button" class="btn" data-action="retry-id">Reintentar</button></div>`;
  return '';
}

function careZoneHtml() {
  const d = draft;
  const care = draftCare();
  const pl = placementOf(d.placement);
  const t = data.climate?.avgTemp;
  const suggested = care ? adjustedDays(care.days, pl, t) : null;

  const every = care && d.auto
    ? `<div class="auto-box">💧 Regar cada <b>${suggested} ${suggested === 1 ? 'día' : 'días'}</b>
        <span class="sub">${Number.isFinite(t) ? `según ${Math.round(t)} °C de media y el lugar` : 'elegí tu ubicación en Ajustes para afinarlo con el clima'}</span></div>`
    : `<div><label for="f-every">Regar cada (días)</label>
        <input type="number" id="f-every" min="1" max="365" inputmode="numeric" value="${esc(d.everyDays)}" required /></div>`;

  return `${care ? careCardHtml(care, pl) : ''}
      ${
        care
          ? `<label class="check"><input type="checkbox" id="f-auto" ${d.auto ? 'checked' : ''} /> Frecuencia automática
              <span class="sub">(se ajusta sola con el clima)</span></label>`
          : ''
      }
      ${every}`;
}

function refreshCareZone() {
  const z = document.getElementById('care-zone');
  if (z) z.innerHTML = careZoneHtml();
  const nm = document.getElementById('f-name');
  if (nm && !draft.nameTouched) nm.value = draft.name;
  document.querySelectorAll('.pchip').forEach((c) => c.classList.toggle('on', c.dataset.id === draft.placement));
}

function viewForm() {
  const d = draft;
  const editing = !!d.id;
  const cands = d.candidates.length
    ? `<label>¿Cuál es?</label><div class="cands">${d.candidates
        .map(
          (c, i) => `<button type="button" class="cand ${d.sci === c.sci ? 'on' : ''}" data-action="pick-cand" data-i="${i}">
            <b>${esc(c.common || c.sci)}</b>
            <span class="sub">${esc(c.sci)} · ${Math.round(c.score * 100)}% de coincidencia</span></button>`,
        )
        .join('')}</div>`
    : '';

  return `<div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Volver">←</button>
      <h1>${editing ? 'Editar planta' : 'Nueva planta'}</h1></div>
    <form id="form" class="stack" autocomplete="off">
      <button type="button" class="photo-pick" data-action="pick-photo">
        ${d.photo ? `<img src="${d.photo}" alt="" />` : '<span>📷<br /><b>Sacale una foto</b><br /><span class="sub">y la reconozco</span></span>'}
      </button>
      <input type="file" id="photo-input" accept="image/*" hidden />
      ${statusBox()}
      ${cands}
      <div><label for="f-species">Especie</label>
        <input type="text" id="f-species" list="species-list" maxlength="60" value="${esc(d.speciesText)}" placeholder="Elegila de la lista o escribila" />
        <datalist id="species-list">${allNames().map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
      <div><label for="f-name">Nombre *</label>
        <input type="text" id="f-name" required maxlength="40" value="${esc(d.name)}" placeholder="Ej: Monstera del living" /></div>
      <label>¿Dónde está?</label>
      <div class="pchips">${PLACEMENTS.map(
        (x) => `<button type="button" class="pchip ${d.placement === x.id ? 'on' : ''}" data-action="placement" data-id="${x.id}">
          <span>${x.icon}</span>${esc(x.label)}</button>`,
      ).join('')}</div>
      <div id="care-zone" class="stack">${careZoneHtml()}</div>
      <div><label for="f-last">Último riego</label>
        <input type="date" id="f-last" max="${dateStr()}" value="${esc(d.lastWatered)}" required /></div>
      <button class="btn block" type="submit" style="margin-top: 18px">${editing ? 'Guardar cambios' : 'Agregar planta'}</button>
      ${editing ? `<button class="btn danger block" type="button" data-action="delete" data-id="${d.id}">Eliminar planta</button>` : ''}
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
  const species = Object.values(data.species);
  const c = data.climate;

  return `<div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Volver">←</button>
      <h1>Ajustes</h1></div>

    <div class="card" style="padding: 16px">
      <b>📍 Mi ubicación</b>
      <p class="sub" style="margin: 4px 0 10px">${
        data.place
          ? `${esc(data.place.name)}${c ? ` · ${Math.round(c.avgTemp)} °C de media, mínima de ${Math.round(c.minNext3)} °C en 3 días` : ''}`
          : 'Todavía no elegiste. La uso para ajustar el riego al clima y avisarte de heladas.'
      }</p>
      <button class="btn secondary block" data-action="use-gps">Usar mi ubicación actual</button>
      <div class="row" style="margin-top: 10px">
        <input type="text" id="city-q" placeholder="O buscá tu ciudad" maxlength="60" />
        <button class="btn secondary" style="flex: none" data-action="search-city">Buscar</button>
      </div>
      ${cityMsg ? `<p class="hint">${esc(cityMsg)}</p>` : ''}
      <div class="stack" style="margin-top: 8px">${cityResults
        .map((r, i) => `<button class="btn secondary block" data-action="pick-city" data-i="${i}" style="justify-content: flex-start; text-align: left">${esc(r.name)}</button>`)
        .join('')}</div>
    </div>

    <div class="card" style="padding: 16px; margin-top: 12px">
      <b>🔎 Reconocimiento de plantas (PlantNet)</b>
      <label for="s-key" style="margin-top: 10px">Clave de la API</label>
      <input type="password" id="s-key" value="${esc(data.keys.plantnet)}" placeholder="Pegá tu clave" autocomplete="off" />
      <p class="hint">Es gratis: creás una cuenta en my.plantnet.org y copiás la clave de “API”. Queda guardada solo en tu celular.</p>
    </div>

    <div class="card" style="padding: 16px; margin-top: 12px">
      <label for="s-time" style="margin-top: 0">Hora del aviso diario</label>
      <input type="time" id="s-time" value="${pad(data.settings.hour)}:${pad(data.settings.minute)}" />
      <p class="hint">Te aviso a esta hora el día que toca regar, y los 3 días siguientes si se te pasa.</p>
      <p style="margin-bottom: 8px">${permText}</p>
      <div class="stack">
        ${native && perm !== 'granted' ? '<button class="btn block" data-action="ask-perm">Activar notificaciones</button>' : ''}
        ${native && perm === 'granted' ? '<button class="btn secondary block" data-action="test-notif">Probar notificación (5 s)</button>' : ''}
      </div>
    </div>

    <div class="card" style="padding: 16px; margin-top: 12px">
      <b>📚 Mi base de plantas</b>
      <p class="sub" style="margin: 4px 0 8px">Las especies que fuiste sumando quedan guardadas con sus cuidados y funcionan sin internet. Cuando hay wifi se completan solas.</p>
      ${
        species.length
          ? `<ul class="history">${species
              .map(
                (s) => `<li><span>${s.wiki ? '✅' : '⏳'}</span><div><div><i>${esc(s.sci)}</i></div>
                  <div class="when">${s.wiki ? 'Ficha completa' : 'Pendiente de completar con wifi'}</div></div></li>`,
              )
              .join('')}</ul>`
          : '<p class="sub">Todavía no hay especies.</p>'
      }
      ${online() && species.some((s) => !s.wiki) ? '<button class="btn secondary block" style="margin-top: 10px" data-action="sync-now">Completar ahora</button>' : ''}
    </div>`;
}

/* ---------- router ---------- */

function render() {
  const [, name, id] = route().split('/');
  let html;
  if (name === 'p' && getPlant(id)) html = viewDetail(getPlant(id));
  else if (name === 'new') {
    if (!draft || draft.id) draft = newDraft(null);
    html = viewForm();
  } else if (name === 'edit' && getPlant(id)) {
    if (!draft || draft.id !== id) draft = newDraft(getPlant(id));
    html = viewForm();
  } else if (name === 'ajustes') html = viewSettings();
  else html = viewList();

  const keepScroll = window.scrollY;
  $app.innerHTML = html;
  if (['new', 'edit', 'ajustes'].includes(name) && window.__keepScroll) window.scrollTo(0, keepScroll);
  else window.scrollTo(0, 0);
  window.__keepScroll = false;
}

window.addEventListener('hashchange', render);

/* ---------- acciones ---------- */

function rerender() {
  window.__keepScroll = true;
  render();
}

async function doAskPerm() {
  perm = await askPermission();
  await reschedule(data.plants, data.settings, extraAlerts());
  if (perm === 'granted') toast('Notificaciones activadas 🔔');
  render();
}

function doWater(id) {
  if (!getPlant(id)) return;
  data.plants = data.plants.map((x) => (x.id === id ? waterPlant(x) : x));
  persist();
  toast(`💧 Anotado. Próximo riego: ${fmtDay(nextDue(getPlant(id)))}`);
  render();
}

async function setPlace(place) {
  data.place = place;
  data.climate = null;
  cityResults = [];
  cityMsg = '';
  persist({ resched: false });
  toast(`📍 ${place.name}`);
  render();
  await refreshClimate(true);
  if (routeName() === 'ajustes') render();
}

function savePlant() {
  syncDraft();
  const d = draft;
  const name = d.name.trim();
  if (!name) return;
  if (d.speciesText.trim() && d.speciesText.trim().toLowerCase() !== d.sci.toLowerCase()) resolveManualSpecies();

  const care = draftCare();
  const pl = placementOf(d.placement);
  const auto = !!(care && d.auto);
  const baseDays = care ? care.days : 0;
  const everyDays = auto
    ? adjustedDays(baseDays, pl, data.climate?.avgTemp)
    : Math.max(1, Math.min(365, Number(d.everyDays) || 7));

  if (d.sci && (care.source !== 'genérico' || d.candidates.some((c) => c.sci === d.sci))) {
    rememberSpecies(d.sci, d.genus, d.family);
  }
  const speciesLabel = d.sci || d.speciesText.trim();

  if (d.id) {
    data.plants = data.plants.map((x) =>
      x.id === d.id
        ? {
            ...x, name, photo: d.photo, species: speciesLabel, sci: d.sci, genus: d.genus, family: d.family,
            placement: d.placement, auto, baseDays, everyDays, lastWatered: d.lastWatered,
          }
        : x,
    );
    persist();
    syncSpecies();
    toast('Cambios guardados');
    const id = d.id;
    draft = null;
    return go(`/p/${id}`, true);
  }

  const plant = newPlant({
    nid: data.nextNid, name, species: speciesLabel, photo: d.photo, sci: d.sci, genus: d.genus, family: d.family,
    placement: d.placement, auto, baseDays, everyDays, lastWatered: d.lastWatered,
  });
  data.nextNid += 1;
  data.plants.push(plant);
  persist();
  syncSpecies();
  draft = null;
  toast('Planta agregada 🌿');
  go('/', true);
}

$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, i } = el.dataset;

  if (action === 'water') {
    e.stopPropagation();
    return doWater(id);
  }
  if (action === 'open') return go(`/p/${id}`);
  if (action === 'new') {
    draft = null;
    return go('/new');
  }
  if (action === 'edit') {
    draft = null;
    return go(`/edit/${id}`);
  }
  if (action === 'settings') {
    syncDraft();
    return go('/ajustes');
  }
  if (action === 'back') {
    if (['new', 'edit'].includes(routeName())) draft = null;
    return history.length > 1 ? history.back() : go('/', true);
  }
  if (action === 'ask-perm') return doAskPerm();
  if (action === 'pick-photo') return takePhoto();
  if (action === 'retry-id') return identify();
  if (action === 'pick-cand') {
    syncDraft();
    pickCandidate(Number(i));
    refreshCareZone();
    const sp = document.getElementById('f-species');
    if (sp) sp.value = draft.speciesText;
    return document.querySelectorAll('.cand').forEach((c, k) => c.classList.toggle('on', k === Number(i)));
  }
  if (action === 'placement') {
    syncDraft();
    draft.placement = id;
    return refreshCareZone();
  }
  if (action === 'sync-now') {
    toast('Completando…');
    await syncSpecies();
    return render();
  }

  if (action === 'add-note') {
    const input = document.getElementById('note');
    const text = input.value.trim();
    if (!text) return;
    data.plants = data.plants.map((x) => (x.id === id ? addNote(x, text) : x));
    persist({ resched: false });
    return render();
  }

  if (action === 'delete') {
    const p = getPlant(id);
    if (p && confirm(`¿Eliminar "${p.name}"? Se borra también su historial.`)) {
      data.plants = data.plants.filter((x) => x.id !== id);
      persist();
      draft = null;
      toast('Planta eliminada');
      return go('/', true);
    }
  }

  if (action === 'test-notif') {
    const ok = await sendTest();
    return toast(ok ? 'Te llega en 5 segundos. Podés salir de la app.' : 'No se pudo programar la prueba.');
  }

  if (action === 'use-gps') {
    cityMsg = 'Buscando tu ubicación…';
    rerender();
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000 });
      const { latitude: lat, longitude: lon } = pos.coords;
      return setPlace({ name: `Mi ubicación (${lat.toFixed(2)}, ${lon.toFixed(2)})`, lat, lon });
    } catch {
      cityMsg = 'No pude obtener la ubicación. Revisá el permiso o buscá tu ciudad.';
      return rerender();
    }
  }

  if (action === 'search-city') {
    const q = document.getElementById('city-q').value.trim();
    if (q.length < 2) return;
    if (!online()) {
      cityMsg = 'Necesito internet para buscar la ciudad.';
      return rerender();
    }
    cityMsg = 'Buscando…';
    cityResults = [];
    rerender();
    try {
      cityResults = await searchCity(q);
      cityMsg = cityResults.length ? '' : 'No encontré esa ciudad.';
    } catch {
      cityMsg = 'No pude buscar. Probá de nuevo.';
    }
    return rerender();
  }

  if (action === 'pick-city') return setPlace(cityResults[Number(i)]);
});

$app.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'photo-input' && t.files[0]) {
    try {
      await onPhoto(await fileToDataURL(t.files[0]));
    } catch (err) {
      toast(err.message);
    }
  }
  if (t.id === 'f-species') {
    syncDraft();
    resolveManualSpecies();
    refreshCareZone();
  }
  if (t.id === 'f-auto') {
    syncDraft();
    refreshCareZone();
  }
  if (t.id === 's-time' && t.value) {
    const [h, m] = t.value.split(':').map(Number);
    data.settings = { ...data.settings, hour: h, minute: m };
    persist();
    toast(`Aviso a las ${pad(h)}:${pad(m)}`);
  }
  if (t.id === 's-key') {
    data.keys.plantnet = t.value.trim();
    persist({ resched: false });
    toast(data.keys.plantnet ? 'Clave guardada' : 'Clave borrada');
  }
});

$app.addEventListener('submit', (e) => {
  if (e.target.id !== 'form') return;
  e.preventDefault();
  savePlant();
});

window.addEventListener('online', () => syncOnline());

/* ---------- arranque ---------- */

(async function init() {
  await setupChannel();
  perm = await permissionState();
  onNotificationTap((plantId) => {
    if (getPlant(plantId)) go(`/p/${plantId}`);
  });
  applyClimate();
  await reschedule(data.plants, data.settings, extraAlerts());
  render();
  syncOnline();
})();
