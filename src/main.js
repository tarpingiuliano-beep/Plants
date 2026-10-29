import './styles.css';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { defaultState, loadAsync, save, flushNow, setSaveErrorHandler } from './store.js';
import { buildBackup, backupFileName, parseBackup, summarize, replaceWith, mergeWith, needsBackupReminder, lastBackupText } from './backup.js';
import { refreshCare } from './migrate.js';
import { askCare, askExtra, askJson, testGeminiKey } from './ai.js';
import { TEMPLATES, templateById, buildPlanPrompt, parsePlan, stageTask, stageState, stageEnd, createProject, projectProgress, addLog } from './projects.js';
import { MONTHS, eventsOf, eventsInMonth, digestText, buildMonthlyDigests, monthsText } from './extras.js';
import { shareTextFile, copyText, sharePhotosWithText } from './files.js';
import {
  MAX_PHOTOS, makeTask, buildPrompt, parseAnswer, tasksFromActions, completeTask, removeTask, taskState, taskText, dueTasks, buildTaskSchedule,
} from './novedad.js';
import {
  dateStr,
  addDays,
  daysBetween,
  nextDue,
  waterStatus,
  statusText,
  sortPlants,
  newPlant,
  waterPlant,
  addNote,
  adjustedDays,
  buildColdAlerts,
  calibrate,
  tagLastWatering,
  SOIL,
  buildHeatAlerts,
  buildStormAlerts,
  stormOf,
  plantsAtHeatRisk,
  projectDue,
  plantsAtColdRisk,
  COLD_ALERT_FROM,
} from './logic.js';
import { PLACEMENTS, placementOf, lookup, searchSpecies, allNames, advice, lightLabel } from './species.js';
import { fetchClimate, searchCity, identifyPlant, fetchWiki, testKey } from './net.js';
import {
  isNative,
  permissionState,
  askPermission,
  setupChannel,
  reschedule,
  onNotificationTap,
  sendTest,
  exactAlarmState,
  openExactAlarmSettings,
} from './notifications.js';

let data = defaultState();
let perm = 'unsupported';
let exactAlarm = 'unsupported';
let draft = null; // borrador del formulario de planta
let cityResults = [];
let cityMsg = '';
let keyMsg = '';
let gMsg = '';
let aiBusy = false;

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

/* ---------- utilidades ---------- */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return `${d}/${m}/${y}`;
};
const fmtDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};
const fmtWhen = (iso) =>
  new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = (ms) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 2) return 'recién';
  if (m < 90) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};
const online = () => navigator.onLine !== false;

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

let nov = null; // "Sumar novedad" en curso
const newNov = (plantId) => ({ plantId, text: '', photos: [], step: 'form', raw: '', result: null, msg: '' });
let pendingRestore = null; // { backup, summary } esperando confirmación
let backupMsg = '';

const route = () => location.hash.replace(/^#/, '') || '/';
const routeName = () => route().split('/')[1] || '';
const go = (path, replace = false) => {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
};

const getPlant = (id) => data.plants.find((p) => p.id === id);
const getProject = (id) => data.projects.find((p) => p.id === id);
const holders = () => [...data.plants, ...data.projects.filter((j) => !j.done)];
const seasonOf = (p) => (p.sci ? data.species[p.sci]?.extra || null : null);
const careOf = (p) => (p.sci ? data.species[p.sci]?.care || lookup(p.sci, p.genus, p.family) : null);

/** Avisos de helada/frío para las notificaciones */
const extraAlerts = () => [
  ...buildColdAlerts(data.plants, data.climate, careOf, placementOf),
  ...buildHeatAlerts(data.plants, data.climate, careOf, placementOf),
  ...buildStormAlerts(data.plants, data.climate, placementOf),
  ...buildTaskSchedule(holders()),
  ...(data.settings.seasonAlerts === false ? [] : buildMonthlyDigests(data.plants, seasonOf)),
];

function persist({ resched = true } = {}) {
  applyClimate();
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
  data.plants = data.plants.map((p) => {
    if (!(p.auto && p.baseDays)) return p;
    const pl = placementOf(p.placement);
    const eff = { ...p, baseDays: p.baseDays * (p.calib || 1) }; // lo aprendido de esta planta
    return {
      ...p,
      everyDays: adjustedDays(eff.baseDays, pl, t),
      projDue: projectDue(eff, pl, data.climate),
      projFor: p.lastWatered,
    };
  });
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

/** Pide a Gemini (una vez por especie) los cuidados base y la ficha de temporada. */
async function syncAiCare() {
  const key = data.keys.gemini;
  if (!key || !online() || aiBusy) return;
  aiBusy = true;
  try {
    if (!data.keys.geminiModel) {
      const t = await testGeminiKey(key);
      if (!t.ok) return;
      data.keys.geminiModel = t.model;
    }
    let changed = false;
    const recent = (t) => t && Date.now() - t < 6 * 3600000;
    outer: for (const sp of Object.values(data.species)) {
      const plant = data.plants.find((p) => p.sci === sp.sci);
      if (!['especie', 'IA'].includes(sp.care?.source) && !recent(sp.aiTried)) {
        sp.aiTried = Date.now();
        changed = true;
        const r = await askCare(
          { sci: sp.sci, commonName: sp.names?.[0], family: plant?.family, placement: placementOf(plant?.placement), place: data.place, climate: data.climate },
          key,
          data.keys.geminiModel,
        );
        if (r.care) {
          sp.care = r.care;
          data.plants = data.plants.map((p) => (p.sci === sp.sci && p.auto ? { ...p, baseDays: r.care.days } : p));
        } else {
          if (/ 404/.test(r.error || '')) data.keys.geminiModel = '';
          if (r.quota) break outer;
        }
      }
      if ((!sp.extra || sp.extraStale) && !recent(sp.extraTried)) {
        sp.extraTried = Date.now();
        changed = true;
        const r = await askExtra({ sci: sp.sci, commonName: sp.names?.[0], place: data.place, myFertilizer: data.settings.myFertilizer }, key, data.keys.geminiModel);
        if (r.extra) {
          sp.extra = r.extra;
          sp.extraStale = false;
        } else {
          if (/ 404/.test(r.error || '')) data.keys.geminiModel = '';
          if (r.quota) break outer;
        }
      }
    }
    if (changed) {
      applyClimate();
      persist();
      if (['p', 'ajustes', '', 'calendario'].includes(routeName())) render();
    }
  } finally {
    aiBusy = false;
  }
}

async function syncOnline() {
  await refreshClimate();
  await syncSpecies();
  await syncAiCare();
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
  if (needsBackupReminder(data.plants.length, data.lastBackup)) {
    banners.push(`<div class="banner"><span>💾 ${data.lastBackup ? 'Hace rato que no hacés un respaldo.' : 'Todavía no hiciste un respaldo de tus plantas.'}</span>
      <button class="btn" data-action="settings">Respaldar</button></div>`);
  }
  const due = dueTasks(holders(), today);
  if (due.length) {
    const first = due[0];
    banners.push(`<div class="banner"><span>📋 ${due.length === 1 ? '1 tarea para hoy' : `${due.length} tareas para hoy`}: ${esc(first.plant.name)} — ${esc(first.task.title)}${due.length > 1 ? '…' : ''}</span>
      <button class="btn" data-action="open-any" data-id="${first.plant.id}">Ver</button></div>`);
  }
  if (!data.place) {
    banners.push(`<div class="banner"><span>📍 Elegí dónde vivís y ajusto el riego al clima de tu zona.</span>
      <button class="btn" data-action="settings">Elegir</button></div>`);
  }
  const monthItems = data.settings.seasonAlerts === false ? [] : eventsInMonth(data.plants, seasonOf, thisMonth());
  if (monthItems.length) {
    banners.push(`<div class="banner"><span>🌿 Este mes: ${esc(digestText(monthItems))}</span>
      <button class="btn" data-action="calendar">Ver</button></div>`);
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
    const hot = c.days.slice(0, 2).find((d) => plantsAtHeatRisk(data.plants, d.max, careOf, placementOf).length);
    if (hot) {
      const risk = plantsAtHeatRisk(data.plants, hot.max, careOf, placementOf);
      banners.push(`<div class="banner cold"><span>🥵 Calor fuerte el ${fmtDay(hot.date)} (máxima ${Math.round(hot.max)} °C).
        Revisá la humedad y dales sombra: <b>${risk.map((p) => esc(p.name)).join(', ')}</b></span></div>`);
    }
    const stormDay = c.days.slice(0, 2).find((d) => stormOf(d));
    const outside = data.plants.filter((p) => placementOf(p.placement).outdoor);
    if (stormDay && outside.length) {
      const what = { granizo: 'tormenta con posible granizo', tormenta: 'tormenta', viento: 'viento fuerte' }[stormOf(stormDay)];
      banners.push(`<div class="banner cold"><span>⛈️ ${fmtDay(stormDay.date)}: ${what}. Entrá o resguardá:
        <b>${outside.map((p) => esc(p.name)).join(', ')}</b></span></div>`);
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
      <div class="row" style="flex: none; gap: 4px"><button class="icon-btn" data-action="calendar" aria-label="Calendario">📅</button>
      <button class="icon-btn" data-action="settings" aria-label="Ajustes">⚙️</button></div></div>
    ${data.place ? `<p class="sub" style="margin: -6px 0 12px">${weatherLine()}</p>` : ''}
    ${banners.join('')}
    ${plants.length ? cards : empty}
    ${projectsListHtml()}
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
    IA: `consultado a Gemini (seguridad ${care.confidence || 'media'})`,
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
  const histItem = (h) => {
    if (h.type === 'novedad') {
      const d = h.diagnosis || {};
      return `<li><span>🩺</span><div><div>${esc(h.note || 'Novedad')}</div>
        ${d.causa ? `<div class="sub">Causa probable: ${esc(d.causa)}${d.confianza ? ` (confianza ${esc(d.confianza)})` : ''}</div>` : ''}
        ${(h.photos || []).length ? `<div class="thumbs">${h.photos.map((x) => `<img src="${x}" alt="" />`).join('')}</div>` : ''}
        <div class="when">${fmtWhen(h.at)}</div></div></li>`;
    }
    return `<li><span>${h.type === 'riego' ? '💧' : '📝'}</span>
      <div><div>${h.type === 'riego' ? `Riego${h.soil ? ` — ${esc(SOIL[h.soil] || '')}` : ''}` : esc(h.note)}${h.type === 'riego' && h.note ? ` — ${esc(h.note)}` : ''}</div>
      <div class="when">${fmtWhen(h.at)}</div></div></li>`;
  };
  const hist = p.history.length ? p.history.map(histItem).join('') : '<p class="sub">Todavía no hay registros.</p>';
  const tasks = [...(p.tasks || [])].sort((a, b) => (a.due + a.time).localeCompare(b.due + b.time));
  const tasksHtml = tasks.length
    ? `<h2>Tareas</h2><div class="card" style="padding: 4px 16px"><ul class="history">${tasks
        .map(
          (t) => `<li><span>${taskState(t, today) === 'later' ? '🗓️' : '⏰'}</span>
            <div style="flex: 1"><div>${esc(t.title)}</div>
            ${t.detail ? `<div class="sub">${esc(t.detail)}</div>` : ''}
            <div class="when">${esc(taskText(t, today))}</div>
            <div class="row" style="margin-top: 6px">
              <button class="btn secondary" data-action="task-done" data-id="${p.id}" data-tid="${t.id}">✓ Hecha</button>
              <button class="btn secondary" data-action="task-del" data-id="${p.id}" data-tid="${t.id}" aria-label="Borrar tarea">🗑</button>
            </div></div></li>`,
        )
        .join('')}</ul></div>`
    : '';

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
        ${
          p.calibN
            ? `<p class="hint" style="margin: 10px 0 0">Aprendí el ritmo de esta planta en ${p.calibN} ${p.calibN === 1 ? 'riego' : 'riegos'}: ${
                (p.calib || 1) > 1 ? 'necesita menos agua' : (p.calib || 1) < 1 ? 'necesita más agua' : 'va bien'
              } que lo típico de su especie (×${(p.calib || 1).toFixed(2)}).
              <button class="btn secondary" style="margin-left: 6px" data-action="calib-reset" data-id="${p.id}">Restablecer</button></p>`
            : ''
        }
        <button class="btn blue block" style="margin-top: 10px" data-action="water" data-id="${p.id}">💧 Ya la regué</button>
        <button class="btn secondary block" style="margin-top: 8px" data-action="nov-start" data-id="${p.id}">🩺 Sumar novedad</button>
      </div>
    </div>
    ${care ? `<div style="margin-top: 12px">${careCardHtml(care, placementOf(p.placement), { wiki: sp?.wiki })}</div>` : ''}
    ${seasonCardHtml(p)}
    ${tasksHtml}
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
      ${c ? `<p class="hint" style="margin: 0 0 10px">Pronóstico de ${c.days.length} días actualizado ${ago(c.fetchedAt)}. Lo uso para calcular cada riego día por día.</p>` : ''}
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
      <button class="btn secondary block" style="margin-top: 10px" data-action="test-key">Probar clave</button>
      ${keyMsg ? `<p class="status ${keyMsg.startsWith('✅') ? '' : 'warn'}" style="margin-top: 10px">${esc(keyMsg)}</p>` : ''}
      <p class="hint">Es gratis: creás una cuenta en my.plantnet.org y copiás la clave de “API”. Queda guardada solo en tu celular.</p>
    </div>

    <div class="card" style="padding: 16px; margin-top: 12px">
      <b>🤖 Cuidados con IA (Gemini)</b>
      <p class="sub" style="margin: 4px 0 8px">Para las plantas que mi tabla no conoce bien, le pregunto a Gemini cada cuánto regarla y qué luz necesita, una sola vez por especie. Después se ajusta sola al clima y a la estación.</p>
      <label for="s-gkey">Clave de la API de Gemini</label>
      <input type="password" id="s-gkey" value="${esc(data.keys.gemini)}" placeholder="Pegá tu clave" autocomplete="off" />
      <button class="btn secondary block" style="margin-top: 10px" data-action="test-gkey">Probar clave</button>
      ${gMsg ? `<p class="status ${gMsg.startsWith('✅') ? '' : 'warn'}" style="margin-top: 10px">${esc(gMsg)}</p>` : ''}
      <p class="hint">Se saca gratis en aistudio.google.com → “Get API key” (es distinta de tu suscripción de Google AI Plus). Solo se envía el nombre de la especie, dónde la tenés y el clima general: nunca fotos ni datos tuyos. En el plan gratis Google puede usar esos textos para mejorar sus productos.</p>
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
      <b>🪱 Mi abono y avisos de temporada</b>
      <label for="s-fert" style="margin-top: 10px">Abono que tengo en casa</label>
      <input type="text" id="s-fert" value="${esc(data.settings.myFertilizer || '')}" maxlength="80" placeholder="Ej: humus de lombriz" />
      <p class="hint">Se lo cuento a Gemini para que te diga cuánto y cada cuánto usarlo en cada planta. Si lo cambiás, actualizo las recomendaciones.</p>
      <label class="check" style="margin-top: 10px"><input type="checkbox" id="s-season" ${data.settings.seasonAlerts === false ? '' : 'checked'} />
        <span>Avisarme el día 1 de cada mes lo que toca (abonar, podar, esquejes, semillas…)</span></label>
    </div>

    <div class="card" style="padding: 16px; margin-top: 12px">
      <b>🔋 Para que los avisos nunca fallen</b>
      <p class="sub" style="margin: 4px 0 8px">Los avisos los dispara el sistema aunque la app esté cerrada. Pero Samsung a veces “duerme” las apps que no usás y eso puede frenarlos. Se arregla una sola vez:</p>
      <ol class="steps">
        <li>Mantené apretado el ícono de <b>Plantas</b> → <b>Información de la app</b> → <b>Batería</b> → elegí <b>Sin restricciones</b>.</li>
        <li>Abrí <b>Ajustes del celu → Cuidado del dispositivo → Batería → Límites de uso en segundo plano</b>. Si Plantas está en “Apps en suspensión”, sacala. Y apagá “Poner en suspensión las apps que no uso”.</li>
        <li>En <b>Información de la app → Notificaciones</b>, dejá todo activado.</li>
      </ol>
      ${
        native && exactAlarm !== 'unsupported'
          ? exactAlarm === 'granted'
            ? '<p class="status">✅ Avisos a la hora exacta: permitido.</p>'
            : '<p class="status warn">Android todavía no me deja avisar a la hora exacta: puede demorar los avisos varios minutos.</p><button class="btn block" style="margin-top: 8px" data-action="exact-alarm">Permitir “Alarmas y recordatorios”</button>'
          : ''
      }
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
    </div>

    <div class="card" style="padding: 16px; margin-top: 12px">
      <b>💾 Respaldo</b>
      <p class="sub" style="margin: 4px 0 8px">${data.plants.length} plantas · ${species.length} especies guardadas. ${lastBackupText(data.lastBackup)}</p>
      <p class="hint" style="margin-top: 0">Si desinstalás la app o cambiás de celu, se pierde todo. El archivo no incluye tu clave de PlantNet.</p>
      <button class="btn block" data-action="backup-save">Guardar respaldo</button>
      <button class="btn secondary block" style="margin-top: 8px" data-action="backup-pick">Restaurar desde un archivo</button>
      <input type="file" id="backup-input" accept=".json,application/json" hidden />
      ${backupMsg ? `<p class="status ${backupMsg.startsWith('✅') ? '' : 'warn'}" style="margin-top: 10px">${esc(backupMsg)}</p>` : ''}
      ${
        pendingRestore
          ? `<div class="banner" style="display: block; margin-top: 10px">
              <b>Este respaldo tiene ${pendingRestore.summary.plants} plantas, ${pendingRestore.summary.projects || 0} proyectos y ${pendingRestore.summary.species} especies</b>
              ${pendingRestore.backup.exportedAt ? `<div class="sub">Guardado el ${esc(fmtWhen(pendingRestore.backup.exportedAt))}</div>` : ''}
              <div class="stack" style="margin-top: 10px">
                <button class="btn block" data-action="restore-merge">Sumar a lo que ya tengo</button>
                <button class="btn danger block" data-action="restore-replace">Reemplazar todo (borra lo actual)</button>
                <button class="btn secondary block" data-action="restore-cancel">Cancelar</button>
              </div></div>`
          : ''
      }
    </div>

    <p class="hint" style="text-align: center; margin-top: 18px">Plantas · build ${esc(__BUILD__)}</p>`;
}



/* ---------- cuidados de temporada y calendario ---------- */

const thisMonth = () => new Date().getMonth() + 1;

function seasonCardHtml(p) {
  const ex = seasonOf(p);
  if (!ex) {
    if (!p.sci) return '';
    return `<div class="card" style="padding: 14px; margin-top: 12px"><b>🌱 Cuidados de temporada</b>
      <p class="sub" style="margin: 4px 0 0">${
        data.keys.gemini
          ? 'Pendiente: la voy a pedir a Gemini en cuanto haya conexión.'
          : 'Cargá la clave de Gemini en Ajustes y te digo cuándo abonar, podar, hacer esquejes y sacar semillas de esta planta.'
      }</p></div>`;
  }
  const events = eventsOf(ex);
  const now = thisMonth();
  const active = events.filter((e) => e.months.includes(now));
  const abono = ex.abono?.cadaDias
    ? `<button class="btn secondary block" style="margin-top: 10px" data-action="abono-task" data-id="${p.id}">⏰ Recordarme abonar cada ${ex.abono.cadaDias} días (solo en temporada)</button>`
    : '';
  return `<div class="card season" style="padding: 14px; margin-top: 12px">
      <div class="care-head"><b>🌱 Cuidados de temporada</b>
        <span class="sub">Gemini · seguridad ${esc(ex.confidence)}</span></div>
      <p class="sub" style="margin: 6px 0 4px">${MONTHS[now - 1][0].toUpperCase()}${MONTHS[now - 1].slice(1)}: ${active.length ? 'esto toca ahora' : 'no hay nada especial este mes'}</p>
      ${active.map((e) => eventLine(e, true)).join('')}
      ${abono}
      <details style="margin-top: 10px"><summary class="sub">Todo el año, reproducción y plagas</summary>
        ${events.map((e) => eventLine(e, false)).join('')}
        ${ex.plagas.length ? `<div class="ev"><b>🐛 Plagas</b><ul class="notes">${ex.plagas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        <p class="hint">Es una guía de una IA para tu zona: confirmá con tu planta y, ante la duda, probá en una sola rama o maceta.</p>
      </details></div>`;
}

function eventLine(e, open) {
  return `<div class="ev"><b>${e.icon} ${esc(e.label)}</b> <span class="sub">${esc(monthsText(e.months))}</span>
    ${e.text ? `<div class="sub">${esc(e.text)}</div>` : ''}
    ${e.steps.length ? `<ol class="steps">${e.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>`;
}

function viewCalendar() {
  const start = thisMonth();
  const months = Array.from({ length: 6 }, (_, k) => ((start - 1 + k) % 12) + 1);
  const withData = data.plants.filter((p) => seasonOf(p)).length;
  const blocks = months
    .map((m, k) => {
      const items = eventsInMonth(data.plants, seasonOf, m);
      const by = new Map();
      for (const { plant, event } of items) {
        if (!by.has(event.label)) by.set(event.label, { icon: event.icon, plants: [] });
        by.get(event.label).plants.push(plant);
      }
      return `<div class="card" style="padding: 14px; margin-bottom: 10px">
        <b>${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)}${k === 0 ? ' · este mes' : ''}</b>
        ${
          by.size
            ? [...by]
                .map(
                  ([label, v]) => `<div class="ev">${v.icon} ${esc(label)}:
                    ${v.plants.map((p) => `<a href="#/p/${p.id}">${esc(p.name)}</a>`).join(', ')}</div>`,
                )
                .join('')
            : '<div class="sub">Nada especial.</div>'
        }</div>`;
    })
    .join('');
  return `<div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Volver">←</button>
      <h1>Calendario</h1></div>
    ${
      withData === data.plants.length && withData
        ? ''
        : `<p class="hint" style="margin-top: 0">${
            data.keys.gemini
              ? 'Faltan datos de algunas plantas: se completan solas cuando Gemini responde.'
              : 'Para llenar el calendario cargá la clave de Gemini en Ajustes.'
          }</p>`
    }
    ${blocks}
    <p class="hint">Te aviso el día 1 de cada mes a las 10:00 con lo que toca. Guía de una IA para tu zona.</p>`;
}

/* ---------- sumar novedad ---------- */

const novPrompt = (p) =>
  buildPrompt({
    plant: p, care: careOf(p), placement: placementOf(p.placement), place: data.place, climate: data.climate,
    text: nov.text, photoCount: nov.photos.length,
  });

function viewNovedad(p) {
  const head = `<div class="topbar">
      <button class="icon-btn" data-action="back" aria-label="Volver">←</button>
      <h1>Novedad · ${esc(p.name)}</h1></div>`;

  if (nov.step === 'form') {
    return `${head}
    <div class="card" style="padding: 16px">
      <label for="nov-text" style="margin-top: 0">¿Qué notaste?</label>
      <textarea id="nov-text" rows="4" maxlength="600" placeholder="Ej: le salieron manchas marrones en las hojas de abajo, hace 3 días">${esc(nov.text)}</textarea>
      <div class="thumbs" style="margin-top: 10px">${nov.photos
        .map((x, i) => `<span class="thumb"><img src="${x}" alt="" /><button type="button" class="x" data-action="nov-rm-photo" data-i="${i}" aria-label="Quitar foto">✕</button></span>`)
        .join('')}</div>
      ${nov.photos.length < MAX_PHOTOS ? `<button class="btn secondary block" style="margin-top: 10px" data-action="nov-add-photo">📷 Agregar foto (${nov.photos.length}/${MAX_PHOTOS})</button>` : ''}
      <input type="file" id="nov-photo-input" accept="image/*" hidden />
      ${nov.msg ? `<p class="status warn" style="margin-top: 10px">${esc(nov.msg)}</p>` : ''}
      <button class="btn block" style="margin-top: 12px" data-action="nov-build">Armar el pedido para Gemini</button>
      <p class="hint">Sin claves: te preparo el texto con los datos de la planta, vos lo llevás a Gemini junto con las fotos y me traés la respuesta.</p>
    </div>`;
  }

  if (nov.step === 'ask') {
    return `${head}
    <div class="card" style="padding: 16px">
      <b>1. Llevalo a Gemini</b>
      <p class="sub" style="margin: 4px 0 10px">Compartí las fotos y el pedido juntos (elegí Gemini en el menú), o copiá el pedido y adjuntá las fotos a mano.</p>
      <button class="btn block" data-action="nov-share">📤 Compartir fotos y pedido</button>
      <button class="btn secondary block" style="margin-top: 8px" data-action="nov-copy">📋 Copiar el pedido</button>
      <details style="margin-top: 10px"><summary class="sub">Ver el pedido</summary>
        <textarea rows="8" readonly>${esc(novPrompt(p))}</textarea></details>
    </div>
    <div class="card" style="padding: 16px; margin-top: 12px">
      <b>2. Traé la respuesta</b>
      <p class="sub" style="margin: 4px 0 10px">Copiá toda la respuesta de Gemini y pegala acá.</p>
      <textarea id="nov-raw" rows="6" placeholder="Pegá la respuesta de Gemini">${esc(nov.raw)}</textarea>
      ${nov.msg ? `<p class="status warn" style="margin-top: 10px">${esc(nov.msg)}</p>` : ''}
      <button class="btn block" style="margin-top: 10px" data-action="nov-read">Leer respuesta</button>
      <button class="btn secondary block" style="margin-top: 8px" data-action="nov-edit">← Cambiar lo que escribí</button>
    </div>`;
  }

  const r = nov.result;
  return `${head}
    <div class="card" style="padding: 16px">
      ${r.resumen ? `<p style="margin: 0 0 8px">${esc(r.resumen)}</p>` : ''}
      ${r.causa ? `<div><span class="sub">Causa probable</span><br /><b>${esc(r.causa)}</b></div>` : ''}
      <div style="margin-top: 8px"><span class="chip ${r.gravedad === 'seria' ? 'overdue' : r.gravedad === 'moderada' ? 'today' : 'ok'}">Gravedad ${esc(r.gravedad)}</span>
        <span class="chip soon">Confianza ${esc(r.confianza)}</span></div>
      ${r.dudas.length ? `<p class="hint">Para estar más seguro: ${r.dudas.map(esc).join(' · ')}</p>` : ''}
      <p class="hint">Es una orientación de una IA, no un diagnóstico. Si se ve grave, consultá en un vivero.</p>
    </div>
    ${
      r.acciones.length
        ? `<h2>Tareas sugeridas</h2><p class="sub" style="margin: -4px 0 8px">Tildá las que quieras. Podés cambiar los días y la hora del aviso.</p>
    ${r.acciones
      .map(
        (a, i) => `<div class="card" style="padding: 14px; margin-bottom: 10px">
        <label class="check"><input type="checkbox" class="nov-chk" data-i="${i}" checked /> <b>${esc(a.titulo)}</b></label>
        ${a.detalle ? `<div class="sub" style="margin: 4px 0 8px">${esc(a.detalle)}</div>` : ''}
        ${a.repetir_cada_dias ? `<div class="sub">Se repite cada ${a.repetir_cada_dias} días${a.veces ? `, ${a.veces} veces` : ''}</div>` : ''}
        <div class="row" style="margin-top: 8px">
          <div><label class="sub">Dentro de (días)</label><input type="number" class="nov-days" data-i="${i}" min="0" max="365" value="${a.en_dias}" /></div>
          <div><label class="sub">Aviso a las</label><input type="time" class="nov-time" data-i="${i}" value="${pad(data.settings.hour)}:${pad(data.settings.minute)}" /></div>
        </div></div>`,
      )
      .join('')}`
        : '<p class="sub">Gemini no sugirió tareas.</p>'
    }
    ${nov.msg ? `<p class="status warn">${esc(nov.msg)}</p>` : ''}
    <button class="btn block" data-action="nov-save">${r.acciones.length ? 'Crear tareas y guardar' : 'Guardar en el historial'}</button>
    ${r.acciones.length ? '<button class="btn secondary block" style="margin-top: 8px" data-action="nov-save-only">Guardar solo en el historial</button>' : ''}
    <button class="btn secondary block" style="margin-top: 8px" data-action="nov-back-ask">← Pegar otra respuesta</button>`;
}

function syncNov() {
  const t = document.getElementById('nov-text');
  if (t) nov.text = t.value;
  const r = document.getElementById('nov-raw');
  if (r) nov.raw = r.value;
}

async function addNovPhoto() {
  syncNov();
  if (nov.photos.length >= MAX_PHOTOS) return;
  if (!isNative()) return document.getElementById('nov-photo-input')?.click();
  try {
    const ph = await Camera.getPhoto({
      quality: 80, width: 1024, resultType: CameraResultType.DataUrl, source: CameraSource.Prompt,
      promptLabelHeader: 'Foto de la planta', promptLabelPhoto: 'Elegir de la galería',
      promptLabelPicture: 'Sacar foto', promptLabelCancel: 'Cancelar',
    });
    if (ph.dataUrl) nov.photos.push(await shrink(ph.dataUrl, 900));
  } catch {
    return; // canceló
  }
  rerender();
}

async function saveNov(withTasks) {
  const p = getPlant(nov.plantId);
  if (!p) return;
  const r = nov.result;
  let picks = [];
  if (withTasks) {
    picks = r.acciones
      .map((a, i) => {
        if (!document.querySelector(`.nov-chk[data-i="${i}"]`)?.checked) return null;
        const days = Number(document.querySelector(`.nov-days[data-i="${i}"]`)?.value);
        const time = document.querySelector(`.nov-time[data-i="${i}"]`)?.value || '09:00';
        return { ...a, en_dias: Number.isFinite(days) ? Math.max(0, Math.min(365, Math.round(days))) : a.en_dias, time };
      })
      .filter(Boolean);
  }
  const thumbs = await Promise.all(nov.photos.map((x) => shrink(x, 220)));
  const entry = {
    at: new Date().toISOString(), type: 'novedad', note: nov.text.trim() || 'Novedad con fotos',
    photos: thumbs, diagnosis: { resumen: r.resumen, causa: r.causa, confianza: r.confianza, gravedad: r.gravedad },
  };
  data.plants = data.plants.map((x) =>
    x.id === p.id
      ? { ...x, history: [entry, ...x.history].slice(0, 200), tasks: [...(x.tasks || []), ...tasksFromActions(picks)] }
      : x,
  );
  persist();
  nov = null;
  toast(picks.length ? `Guardado · ${picks.length} ${picks.length === 1 ? 'tarea creada' : 'tareas creadas'} 🔔` : 'Guardado en el historial');
  go(`/p/${p.id}`, true);
}

/* ---------- proyectos ---------- */

let pj = null; // asistente de "Nuevo proyecto"
const newPj = () => ({ step: 'pick', templateId: null, bonsai: false, name: '', startDate: dateStr(), description: '', raw: '', plan: null, msg: '', busy: false });

function projectsListHtml() {
  const today = dateStr();
  const cards = data.projects
    .map((j) => {
      const pr = projectProgress(j, today);
      const due = (j.tasks || []).filter((t) => daysBetween(today, t.due) <= 0).length;
      const sub = j.done ? 'Terminado' : pr.notStarted ? 'Todavía no empezó' : `Día ${pr.day}${pr.total ? ` de ${pr.total}` : ''}`;
      return `<div class="card plant-card" data-action="open-pj" data-id="${j.id}">
        <div class="thumb">${j.log.find((l) => l.photo) ? `<img class="thumb" src="${j.log.find((l) => l.photo).photo}" alt="" />` : j.icon}</div>
        <div class="info"><div class="name">${esc(j.name)}</div><div class="sub">${esc(sub)}</div>
        ${due ? `<span class="chip today">${due} ${due === 1 ? 'tarea' : 'tareas'} para hoy</span>` : ''}</div></div>`;
    })
    .join('');
  return `<h2>Proyectos</h2>${cards || '<p class="sub" style="margin: -4px 0 8px">Germinar semillas, hacer un bonsái… con su cronología, avisos y diario con fotos.</p>'}
    <button class="btn secondary block" data-action="pj-new">+ Nuevo proyecto</button>`;
}

const hasGemini = () => !!data.keys.gemini;

function viewPjNew() {
  const head = `<div class="topbar"><button class="icon-btn" data-action="pj-back" aria-label="Volver">←</button><h1>Nuevo proyecto</h1></div>`;
  if (pj.step === 'pick') {
    return `${head}<p class="sub">¿Qué querés hacer?</p>
      ${TEMPLATES.map((t) => `<div class="card plant-card" data-action="pj-pick" data-id="${t.id}"><div class="thumb">${t.icon}</div><div class="info"><div class="name">${esc(t.name)}</div><div class="sub">${esc(t.desc)}</div></div></div>`).join('')}
      <div class="card plant-card" data-action="pj-pick" data-id="custom"><div class="thumb">✨</div><div class="info"><div class="name">Otro proyecto, a medida</div><div class="sub">Me contás qué querés hacer y armo el plan con Gemini.</div></div></div>`;
  }
  if (pj.step === 'form') {
    const t = templateById(pj.templateId);
    return `${head}<div class="card" style="padding: 16px">
      <label for="pj-name" style="margin-top: 0">Nombre</label>
      <input id="pj-name" maxlength="60" value="${esc(pj.name)}" placeholder="Ej: Perales de semilla" />
      <label for="pj-start">Fecha de inicio</label>
      <input id="pj-start" type="date" value="${esc(pj.startDate)}" />
      <p class="hint">Puede ser una fecha pasada si ya empezaste: voy a saltear lo que ya quedó atrás.</p>
      ${t ? t.options.map((o) => `<label class="check" style="margin-top: 10px"><input type="checkbox" id="pj-bonsai" ${pj.bonsai ? 'checked' : ''} /> ${esc(o.label)}</label>`).join('') : `
        <label for="pj-desc">¿Qué querés hacer y cómo?</label>
        <textarea id="pj-desc" rows="6" maxlength="3000" placeholder="Ej: dos semillas de palta, una para bonsái y otra con alambre. Las pongo en agua con palillos…">${esc(pj.description)}</textarea>
        <p class="hint">Podés pegar el método que encontraste. ${hasGemini() ? 'Gemini arma el plan con fechas.' : 'Sin clave de Gemini te preparo un pedido para llevar a Gemini y traer la respuesta.'}</p>`}
      ${pj.msg ? `<p class="status warn" style="margin-top: 10px">${esc(pj.msg)}</p>` : ''}
      <button class="btn block" style="margin-top: 12px" data-action="pj-plan" ${pj.busy ? 'disabled' : ''}>${pj.busy ? 'Armando el plan…' : t ? 'Ver el plan' : hasGemini() ? 'Armar el plan con Gemini' : 'Armar el pedido'}</button>
    </div>`;
  }
  if (pj.step === 'ask') {
    return `${head}<div class="card" style="padding: 16px">
      <b>1. Llevalo a Gemini</b>
      <button class="btn block" style="margin-top: 10px" data-action="pj-copy">📋 Copiar el pedido</button>
      <details style="margin-top: 10px"><summary class="sub">Ver el pedido</summary><textarea rows="8" readonly>${esc(pjPrompt())}</textarea></details></div>
      <div class="card" style="padding: 16px; margin-top: 12px"><b>2. Traé la respuesta</b>
      <textarea id="pj-raw" rows="6" placeholder="Pegá la respuesta de Gemini">${esc(pj.raw)}</textarea>
      ${pj.msg ? `<p class="status warn" style="margin-top: 10px">${esc(pj.msg)}</p>` : ''}
      <button class="btn block" style="margin-top: 10px" data-action="pj-read">Leer respuesta</button>
      <button class="btn secondary block" style="margin-top: 8px" data-action="pj-edit">← Cambiar lo que escribí</button></div>`;
  }
  // review
  const plan = pj.plan;
  const today = dateStr();
  const t = templateById(pj.templateId);
  const srcText = plan.source === 'Gemini' ? `armado por Gemini (seguridad ${plan.confidence})` : 'plantilla general de la app, no una consulta a una IA';
  return `${head}<div class="card" style="padding: 16px">
      <b>${esc(pj.name)}</b> <span class="sub">· ${esc(srcText)}</span>
      ${plan.resumen ? `<p style="margin: 8px 0 0">${esc(plan.resumen)}</p>` : ''}
      ${plan.materiales.length ? `<p class="sub" style="margin: 8px 0 0">Necesitás: ${plan.materiales.map(esc).join(' · ')}</p>` : ''}
      ${plan.consejos.length ? `<ul class="notes">${plan.consejos.map((c) => `<li>🌱 ${esc(c)}</li>`).join('')}</ul>` : ''}
      ${plan.alertas.length ? `<ul class="notes">${plan.alertas.map((c) => `<li>⚠️ ${esc(c)}</li>`).join('')}</ul>` : ''}
      <p class="hint">${t ? 'Es un plan general: ajustalo a tu caso.' : 'Es una orientación de una IA; verificá lo importante.'}</p></div>
    <h2>Avisos</h2><p class="sub" style="margin: -4px 0 8px">Tildá las etapas de las que querés que te avise. Las que ya pasaron quedan sin tildar.</p>
    ${plan.etapas
      .map((e, i) => {
        const st = stageState(e, pj.startDate, today);
        const tk = stageTask(e, pj.startDate, today);
        const when = tk ? `Aviso: ${fmtDate(tk.due)}` : 'Ya pasó';
        return `<div class="card" style="padding: 14px; margin-bottom: 10px">
          <label class="check"><input type="checkbox" class="pj-chk" data-i="${i}" ${tk && st !== 'pasada' ? 'checked' : ''} ${tk ? '' : 'disabled'} /> <b>${esc(e.titulo)}</b></label>
          <div class="sub" style="margin: 4px 0">Día ${e.dia}${e.cada ? ` · cada ${e.cada} días${e.veces ? `, ${e.veces} veces` : ''}` : ''} · ${esc(when)}</div>
          <div class="sub">${esc(e.detalle)}</div></div>`;
      })
      .join('')}
    <div class="row"><div><label class="sub">Hora de los avisos</label><input type="time" id="pj-time" value="${pad(data.settings.hour)}:${pad(data.settings.minute)}" /></div></div>
    <button class="btn block" style="margin-top: 12px" data-action="pj-create">Crear proyecto</button>
    <button class="btn secondary block" style="margin-top: 8px" data-action="pj-edit">← Volver</button>`;
}

function pjPrompt() {
  return buildPlanPrompt({ name: pj.name || 'Mi proyecto', description: pj.description, startDate: pj.startDate, place: data.place, climate: data.climate });
}

function syncPj() {
  if (!pj) return;
  const v = (id) => document.getElementById(id);
  if (v('pj-name')) pj.name = v('pj-name').value;
  if (v('pj-start') && v('pj-start').value) pj.startDate = v('pj-start').value;
  if (v('pj-desc')) pj.description = v('pj-desc').value;
  if (v('pj-bonsai')) pj.bonsai = v('pj-bonsai').checked;
  if (v('pj-raw')) pj.raw = v('pj-raw').value;
}

async function pjMakePlan() {
  syncPj();
  if (!pj.name.trim()) return ((pj.msg = 'Ponele un nombre al proyecto.'), render());
  if (!pj.startDate) return ((pj.msg = 'Elegí la fecha de inicio.'), render());
  pj.msg = '';
  const t = templateById(pj.templateId);
  if (t) {
    pj.plan = { ...t.build({ bonsai: pj.bonsai }), source: 'plantilla', confidence: null };
    pj.step = 'review';
    return render();
  }
  if (!pj.description.trim()) return ((pj.msg = 'Contame qué querés hacer.'), render());
  if (!hasGemini()) {
    pj.step = 'ask';
    return render();
  }
  if (!online()) return ((pj.msg = 'Necesito internet para consultar a Gemini.'), render());
  pj.busy = true;
  render();
  if (!data.keys.geminiModel) {
    const tk = await testGeminiKey(data.keys.gemini);
    if (tk.ok) data.keys.geminiModel = tk.model;
  }
  const r = data.keys.geminiModel ? await askJson(pjPrompt(), data.keys.gemini, data.keys.geminiModel) : { error: 'No pude validar la clave de Gemini.' };
  pj.busy = false;
  if (r.error) {
    if (/ 404/.test(r.error)) data.keys.geminiModel = '';
    pj.msg = r.error;
    return render();
  }
  const pr = parsePlan(r.text);
  if (!pr.ok) {
    pj.msg = pr.error;
    return render();
  }
  pj.plan = pr.plan;
  pj.step = 'review';
  render();
}

function pjCreate() {
  const time = document.getElementById('pj-time')?.value || '09:00';
  const today = dateStr();
  const tasks = [];
  document.querySelectorAll('.pj-chk').forEach((c) => {
    if (!c.checked) return;
    const tk = stageTask(pj.plan.etapas[Number(c.dataset.i)], pj.startDate, today, time);
    if (tk) tasks.push(tk);
  });
  const t = templateById(pj.templateId);
  const proj = createProject({ name: pj.name, templateId: pj.templateId, description: pj.description, startDate: pj.startDate, plan: pj.plan, icon: t?.icon || '🌱', tasks });
  data.projects = [...data.projects, proj];
  persist();
  pj = null;
  toast(tasks.length ? `Proyecto creado · ${tasks.length} ${tasks.length === 1 ? 'aviso' : 'avisos'} 🔔` : 'Proyecto creado');
  go(`/proyecto/${proj.id}`, true);
}

let pjPhoto = null; // foto del diario en preparación (data URL)

function viewProject(j) {
  const today = dateStr();
  const pr = projectProgress(j, today);
  const photos = j.log.filter((l) => l.photo);
  const first = photos[photos.length - 1];
  const last = photos[0];
  const tasks = [...(j.tasks || [])].sort((a, b) => a.due.localeCompare(b.due));
  const src = j.plan.source === 'Gemini' ? `armado por Gemini (seguridad ${j.plan.confidence})` : 'plantilla general de la app';
  return `<div class="topbar"><button class="icon-btn" data-action="back" aria-label="Volver">←</button><h1>${esc(j.icon)} ${esc(j.name)}</h1></div>
    <div class="card" style="padding: 16px">
      <b>${j.done ? 'Proyecto terminado' : pr.notStarted ? `Empieza el ${esc(fmtDate(j.startDate))}` : `Día ${pr.day}${pr.total ? ` de ${pr.total}` : ''}`}</b>
      ${pr.total ? `<div class="bar" style="height: 8px; border-radius: 4px; background: rgba(127,127,127,.25); margin: 8px 0"><div style="height: 100%; width: ${pr.pct}%; border-radius: 4px; background: var(--accent, #2e7d32)"></div></div>` : ''}
      <div class="sub">Desde el ${esc(fmtDate(j.startDate))} · plan: ${esc(src)}</div>
      ${j.plan.resumen ? `<p style="margin: 8px 0 0">${esc(j.plan.resumen)}</p>` : ''}
      <details style="margin-top: 8px"><summary class="sub">Materiales, consejos y alertas</summary>
        ${j.plan.materiales.length ? `<p class="sub">Necesitás: ${j.plan.materiales.map(esc).join(' · ')}</p>` : ''}
        <ul class="notes">${j.plan.consejos.map((c) => `<li>🌱 ${esc(c)}</li>`).join('')}${j.plan.alertas.map((c) => `<li>⚠️ ${esc(c)}</li>`).join('')}</ul></details>
    </div>
    <h2>Tareas pendientes</h2>
    ${
      tasks.length
        ? tasks
            .map((t) => {
              const late = daysBetween(today, t.due) < 0;
              return `<div class="card" style="padding: 14px; margin-bottom: 10px">
              <b>${esc(t.title)}</b> <span class="chip ${late ? 'overdue' : daysBetween(today, t.due) === 0 ? 'today' : 'soon'}">${late ? 'Atrasada' : daysBetween(today, t.due) === 0 ? 'Hoy' : esc(fmtDate(t.due))}</span>
              ${t.detail ? `<div class="sub" style="margin: 4px 0 8px">${esc(t.detail)}</div>` : ''}
              <div class="row"><button class="btn secondary" data-action="task-done" data-id="${j.id}" data-tid="${t.id}">✓ Hecha</button>
              <button class="btn secondary" data-action="task-del" data-id="${j.id}" data-tid="${t.id}" aria-label="Borrar tarea">🗑</button></div></div>`;
            })
            .join('')
        : '<p class="sub">No hay tareas con aviso.</p>'
    }
    <h2>Cronología del plan</h2>
    <div class="card" style="padding: 14px">${j.plan.etapas
      .map((e) => {
        const st = stageState(e, j.startDate, today);
        const mark = st === 'pasada' ? '✅' : st === 'en curso' ? '▶️' : '⏳';
        return `<div style="margin-bottom: 8px">${mark} <b>${esc(e.titulo)}</b> <span class="sub">· día ${e.dia}${e.cada ? `–${stageEnd(e)}` : ''} (${esc(fmtDate(addDays(j.startDate, e.dia)))})</span></div>`;
      })
      .join('')}</div>
    <h2>Diario</h2>
    ${first && last && first !== last ? `<div class="card" style="padding: 14px"><b>Primera foto vs. última</b><div class="row" style="margin-top: 8px"><div><img src="${first.photo}" alt="" style="width: 100%; border-radius: 8px" /><div class="sub">${esc(fmtDate(first.at.slice(0, 10)))}</div></div><div><img src="${last.photo}" alt="" style="width: 100%; border-radius: 8px" /><div class="sub">${esc(fmtDate(last.at.slice(0, 10)))}</div></div></div></div>` : ''}
    <div class="card" style="padding: 14px; margin-top: 10px">
      <textarea id="pj-note" rows="2" maxlength="400" placeholder="¿Cómo va? Ej: salió una raicita de 1 cm"></textarea>
      ${pjPhoto ? `<div class="thumbs" style="margin-top: 8px"><span class="thumb"><img src="${pjPhoto}" alt="" /><button type="button" class="x" data-action="pj-rm-photo" aria-label="Quitar foto">✕</button></span></div>` : ''}
      <input type="file" id="pj-photo-input" accept="image/*" hidden />
      <div class="row" style="margin-top: 8px"><button class="btn secondary" data-action="pj-add-photo">📷 Foto</button><button class="btn" data-action="pj-log" data-id="${j.id}">Agregar al diario</button></div>
    </div>
    ${j.log.length ? j.log.map((l) => `<div class="card" style="padding: 12px; margin-top: 8px">${l.photo ? `<img src="${l.photo}" alt="" style="width: 100%; border-radius: 8px; margin-bottom: 6px" />` : ''}<div>${esc(l.text || '')}</div><div class="sub">${esc(fmtWhen(l.at))}</div></div>`).join('') : ''}
    <div class="stack" style="margin-top: 16px">
      <button class="btn secondary block" data-action="pj-finish" data-id="${j.id}">${j.done ? 'Reabrir proyecto' : 'Marcar como terminado'}</button>
      <button class="btn danger block" data-action="pj-delete" data-id="${j.id}">Eliminar proyecto</button></div>`;
}

async function addPjPhoto() {
  syncPjNote();
  if (!isNative()) return document.getElementById('pj-photo-input')?.click();
  try {
    const ph = await Camera.getPhoto({
      quality: 80, width: 1024, resultType: CameraResultType.DataUrl, source: CameraSource.Prompt,
      promptLabelHeader: 'Foto del proyecto', promptLabelPhoto: 'Elegir de la galería',
      promptLabelPicture: 'Sacar foto', promptLabelCancel: 'Cancelar',
    });
    if (ph.dataUrl) pjPhoto = await shrink(ph.dataUrl, 640);
  } catch {
    return;
  }
  rerender();
}

let pjNote = '';
function syncPjNote() {
  const n = document.getElementById('pj-note');
  if (n) pjNote = n.value;
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
  } else if (name === 'novedad' && getPlant(id)) {
    if (!nov || nov.plantId !== id) nov = newNov(id);
    html = viewNovedad(getPlant(id));
  } else if (name === 'proyecto' && id === 'nuevo') {
    if (!pj) pj = newPj();
    html = viewPjNew();
  } else if (name === 'proyecto' && getProject(id)) {
    html = viewProject(getProject(id));
  } else if (name === 'calendario') html = viewCalendar();
  else if (name === 'ajustes') html = viewSettings();
  else html = viewList();

  const keepScroll = window.scrollY;
  $app.innerHTML = html + soilSheet();
  if (['new', 'edit', 'ajustes', 'novedad', 'calendario', 'proyecto'].includes(name) && window.__keepScroll) window.scrollTo(0, keepScroll);
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

let soilAsk = null; // { id, offset }: esperando que cuentes cómo estaba la tierra

function doWater(id) {
  const before = getPlant(id);
  if (!before) return;
  const offset = daysBetween(nextDue(before), dateStr());
  data.plants = data.plants.map((x) => (x.id === id ? waterPlant(x) : x));
  persist();
  toast(`💧 Anotado. Próximo riego: ${fmtDay(nextDue(getPlant(id)))}`);
  soilAsk = before.auto && before.baseDays ? { id, offset } : null;
  render();
}

function answerSoil(v) {
  const ask = soilAsk;
  soilAsk = null;
  const p = ask && getPlant(ask.id);
  if (!p) return render();
  data.plants = data.plants.map((x) => {
    if (x.id !== p.id) return x;
    const tagged = tagLastWatering(x, v);
    return v === 'mal' ? tagged : { ...tagged, ...calibrate(tagged, v, ask.offset) };
  });
  persist();
  if (v === 'mal') {
    toast('Anotado. Sumá una novedad con fotos y te ayudo a ver qué le pasa.');
    nov = newNov(p.id);
    return go(`/novedad/${p.id}`);
  }
  const q = getPlant(p.id);
  toast(v === 'justa' ? 'Perfecto, el ritmo está bien ✓' : `Ajusté el riego: ahora cada ${q.everyDays} días`);
  render();
}

function soilSheet() {
  if (!soilAsk || !getPlant(soilAsk.id)) return '';
  const p = getPlant(soilAsk.id);
  return `<div class="sheet"><div class="sheet-body">
      <div class="sheet-head"><b>${esc(p.name)}: ¿cómo estaba la tierra?</b>
        <button class="icon-btn" data-action="soil-skip" aria-label="Omitir">✕</button></div>
      <div class="sheet-grid">
        <button class="btn secondary" data-action="soil" data-v="humeda">💦 Todavía húmeda</button>
        <button class="btn secondary" data-action="soil" data-v="justa">👌 Justa</button>
        <button class="btn secondary" data-action="soil" data-v="seca">🏜️ Muy seca</button>
        <button class="btn secondary" data-action="soil" data-v="mal">🥀 Se veía mal</button>
      </div>
      <p class="hint" style="margin: 8px 0 0">Con esto aprendo el ritmo real de esta planta en tu casa.</p>
    </div></div>`;
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
  syncSpecies().then(syncAiCare);
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
  if (action === 'open-any') return go(getProject(id) ? `/proyecto/${id}` : `/p/${id}`);
  if (action === 'open-pj') return go(`/proyecto/${id}`);
  if (action === 'pj-new') {
    pj = newPj();
    return go('/proyecto/nuevo');
  }
  if (action === 'pj-back') {
    if (pj && pj.step !== 'pick') {
      syncPj();
      pj.step = pj.step === 'review' ? 'form' : pj.step === 'ask' ? 'form' : 'pick';
      pj.msg = '';
      return render();
    }
    pj = null;
    return history.length > 1 ? history.back() : go('/', true);
  }
  if (action === 'pj-pick') {
    const t = templateById(id);
    pj.templateId = t ? t.id : null;
    pj.name = t ? (t.id === 'estratificacion' ? 'Perales de semilla' : t.id === 'palta' ? 'Paltas' : t.name) : '';
    pj.step = 'form';
    return render();
  }
  if (action === 'pj-plan') return pjMakePlan();
  if (action === 'pj-edit') {
    syncPj();
    pj.step = 'form';
    pj.msg = '';
    return render();
  }
  if (action === 'pj-copy') {
    const ok = await copyText(pjPrompt());
    return toast(ok ? 'Pedido copiado. Pegalo en Gemini.' : 'No pude copiar. Abrí "Ver el pedido" y copialo a mano.');
  }
  if (action === 'pj-read') {
    syncPj();
    const r = parsePlan(pj.raw);
    if (!r.ok) {
      pj.msg = r.error;
      return render();
    }
    pj.plan = r.plan;
    pj.msg = '';
    pj.step = 'review';
    return render();
  }
  if (action === 'pj-create') return pjCreate();
  if (action === 'pj-add-photo') return addPjPhoto();
  if (action === 'pj-rm-photo') {
    syncPjNote();
    pjPhoto = null;
    return rerender();
  }
  if (action === 'pj-log') {
    syncPjNote();
    const text = pjNote.trim();
    if (!text && !pjPhoto) return toast('Escribí algo o sumá una foto.');
    data.projects = data.projects.map((x) => (x.id === id ? addLog(x, { type: 'nota', text, photo: pjPhoto || '' }) : x));
    pjNote = '';
    pjPhoto = null;
    persist({ resched: false });
    toast('Agregado al diario');
    return render();
  }
  if (action === 'pj-finish') {
    data.projects = data.projects.map((x) => (x.id === id ? { ...x, done: !x.done } : x));
    persist();
    return render();
  }
  if (action === 'pj-delete') {
    const j = getProject(id);
    if (j && confirm(`¿Eliminar "${j.name}"? Se borra también su diario.`)) {
      data.projects = data.projects.filter((x) => x.id !== id);
      persist();
      toast('Proyecto eliminado');
      return go('/', true);
    }
    return;
  }
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
  if (action === 'test-key') {
    const input = document.getElementById('s-key');
    if (input) {
      data.keys.plantnet = input.value.trim();
      persist({ resched: false });
    }
    if (!data.keys.plantnet) {
      keyMsg = 'Pegá primero tu clave.';
      return rerender();
    }
    if (!online()) {
      keyMsg = 'Necesito internet para probar la clave.';
      return rerender();
    }
    keyMsg = 'Probando…';
    rerender();
    const r = await testKey(data.keys.plantnet);
    keyMsg = r.ok
      ? '✅ PlantNet aceptó la clave.'
      : `PlantNet respondió error ${r.status}${r.msg ? `: ${r.msg}` : ''}.`;
    return rerender();
  }
  if (action === 'backup-save') {
    try {
      const r = await shareTextFile(backupFileName(), JSON.stringify(buildBackup(data), null, 1));
      if (r !== 'cancelled') {
        data.lastBackup = new Date().toISOString();
        persist({ resched: false });
        backupMsg = r === 'downloaded' ? '✅ Respaldo descargado.' : '✅ Respaldo listo. Guardalo en Drive o mandátelo por WhatsApp.';
      }
    } catch {
      backupMsg = 'No pude guardar el respaldo. Probá de nuevo.';
    }
    return rerender();
  }
  if (action === 'backup-pick') return document.getElementById('backup-input')?.click();
  if (action === 'restore-cancel') {
    pendingRestore = null;
    backupMsg = '';
    return rerender();
  }
  if (action === 'restore-merge' || action === 'restore-replace') {
    if (!pendingRestore) return;
    const incoming = pendingRestore.backup.data;
    let msg;
    if (action === 'restore-merge') {
      const r = mergeWith(data, incoming);
      data = r.data;
      msg = `✅ Sumé ${r.added} plantas${r.skipped ? ` (${r.skipped} ya estaban)` : ''}.`;
    } else {
      data = replaceWith(data, incoming);
      msg = `✅ Restauré ${incoming.plants.length} plantas.`;
    }
    pendingRestore = null;
    backupMsg = msg;
    persist();
    applyClimate();
    syncOnline();
    return rerender();
  }

  if (action === 'calendar') return go('/calendario');
  if (action === 'abono-task') {
    const p = getPlant(id);
    const ex = p && seasonOf(p);
    if (!ex?.abono?.cadaDias) return;
    const { meses, cadaDias, conLoQueTengo, detalle } = ex.abono;
    let due = addDays(dateStr(), cadaDias);
    for (let k = 0; !meses.includes(Number(due.slice(5, 7))) && k < 400; k++) due = addDays(due, 1);
    const t = makeTask({
      title: `Abonar ${p.name}`, detail: conLoQueTengo || detalle || '', due, time: `${pad(data.settings.hour)}:${pad(data.settings.minute)}`,
      every: cadaDias, months: meses, source: 'abono',
    });
    data.plants = data.plants.map((x) => (x.id === id ? { ...x, tasks: [...(x.tasks || []), t] } : x));
    persist();
    toast(`Listo: primer aviso el ${fmtDay(due)}`);
    return render();
  }
  if (action === 'soil') return answerSoil(el.dataset.v);
  if (action === 'soil-skip') {
    soilAsk = null;
    return render();
  }
  if (action === 'calib-reset') {
    data.plants = data.plants.map((x) => (x.id === id ? { ...x, calib: 1, calibN: 0 } : x));
    persist();
    toast('Volví al ritmo original');
    return render();
  }
  if (action === 'nov-start') {
    nov = newNov(id);
    return go(`/novedad/${id}`);
  }
  if (nov && routeName() === 'novedad') {
    if (action === 'nov-add-photo') return addNovPhoto();
    if (action === 'nov-rm-photo') {
      syncNov();
      nov.photos.splice(Number(i), 1);
      return rerender();
    }
    if (action === 'nov-build') {
      syncNov();
      if (!nov.text.trim() && !nov.photos.length) {
        nov.msg = 'Escribí qué notaste o agregá al menos una foto.';
        return rerender();
      }
      nov.msg = '';
      nov.step = 'ask';
      return render();
    }
    if (action === 'nov-edit') {
      syncNov();
      nov.step = 'form';
      nov.msg = '';
      return render();
    }
    if (action === 'nov-copy') {
      const ok = await copyText(novPrompt(getPlant(nov.plantId)));
      return toast(ok ? 'Pedido copiado. Pegalo en Gemini 📋' : 'No pude copiarlo. Abrí “Ver el pedido” y copialo a mano.');
    }
    if (action === 'nov-share') {
      syncNov();
      try {
        const r = await sharePhotosWithText(novPrompt(getPlant(nov.plantId)), nov.photos);
        if (r === 'unsupported') return toast('Compartir funciona en la app de Android. Usá “Copiar el pedido”.');
      } catch {
        toast('No pude compartir. Probá con “Copiar el pedido”.');
      }
      return;
    }
    if (action === 'nov-read') {
      syncNov();
      const r = parseAnswer(nov.raw);
      if (!r.ok) {
        nov.msg = r.error;
        return rerender();
      }
      nov.msg = '';
      nov.result = r.result;
      nov.step = 'review';
      return render();
    }
    if (action === 'nov-back-ask') {
      nov.step = 'ask';
      nov.msg = '';
      return render();
    }
    if (action === 'nov-save') return saveNov(true);
    if (action === 'nov-save-only') return saveNov(false);
  }
  if (action === 'task-done' || action === 'task-del') {
    const { tid } = el.dataset;
    const upd = (x) => {
      if (x.id !== id) return x;
      const task = (x.tasks || []).find((k) => k.id === tid);
      const next = { ...x, tasks: action === 'task-done' ? completeTask(x.tasks || [], tid) : removeTask(x.tasks || [], tid) };
      return getProject(id) && action === 'task-done' && task ? addLog(next, { type: 'tarea', text: `✓ ${task.title}` }) : next;
    };
    data.plants = data.plants.map(upd);
    data.projects = data.projects.map(upd);
    persist();
    toast(action === 'task-done' ? 'Tarea hecha ✓' : 'Tarea borrada');
    return render();
  }
  if (action === 'test-gkey') {
    const input = document.getElementById('s-gkey');
    if (input) {
      data.keys.gemini = input.value.trim();
      data.keys.geminiModel = '';
      persist({ resched: false });
    }
    if (!data.keys.gemini) {
      gMsg = 'Pegá primero tu clave.';
      return rerender();
    }
    if (!online()) {
      gMsg = 'Necesito internet para probar la clave.';
      return rerender();
    }
    gMsg = 'Probando…';
    rerender();
    const r = await testGeminiKey(data.keys.gemini);
    if (r.ok) {
      data.keys.geminiModel = r.model;
      persist({ resched: false });
      gMsg = `✅ Clave aceptada (modelo ${r.model}). Voy a consultar las especies que lo necesiten.`;
      rerender();
      syncAiCare();
      return;
    }
    gMsg = `Google respondió error ${r.status}${r.msg ? `: ${r.msg}` : ''}.`;
    return rerender();
  }
  if (action === 'exact-alarm') {
    await openExactAlarmSettings();
    return toast('Activá “Permitir alarmas y recordatorios” y volvé a la app.');
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
  if (t.id === 'backup-input' && t.files[0]) {
    const file = t.files[0];
    t.value = '';
    try {
      const r = parseBackup(await file.text());
      if (r.ok) {
        pendingRestore = { backup: r.backup, summary: summarize(r.backup.data) };
        backupMsg = '';
      } else {
        pendingRestore = null;
        backupMsg = r.error;
      }
    } catch {
      backupMsg = 'No pude leer el archivo.';
    }
    return rerender();
  }
  if (t.id === 'pj-photo-input' && t.files[0]) {
    try {
      syncPjNote();
      pjPhoto = await shrink(await fileToDataURL(t.files[0]), 640);
      rerender();
    } catch (err) {
      toast(err.message);
    }
  }
  if (t.id === 'nov-photo-input' && t.files[0] && nov) {
    try {
      syncNov();
      nov.photos.push(await shrink(await fileToDataURL(t.files[0]), 900));
      rerender();
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
  if (t.id === 's-fert') {
    const v = t.value.trim();
    if (v !== (data.settings.myFertilizer || '')) {
      data.settings = { ...data.settings, myFertilizer: v };
      Object.values(data.species).forEach((sp) => {
        if (sp.extra) sp.extraStale = true;
        sp.extraTried = 0;
      });
      persist({ resched: false });
      toast('Guardado. Actualizo las recomendaciones…');
      syncAiCare();
    }
  }
  if (t.id === 's-season') {
    data.settings = { ...data.settings, seasonAlerts: t.checked };
    persist();
    toast(t.checked ? 'Avisos mensuales activados' : 'Avisos mensuales apagados');
  }
  if (t.id === 's-gkey') {
    data.keys.gemini = t.value.trim();
    data.keys.geminiModel = '';
    persist({ resched: false });
    toast(data.keys.gemini ? 'Clave guardada' : 'Clave borrada');
    if (data.keys.gemini) syncAiCare();
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  exactAlarmState().then((v) => {
    if (v !== exactAlarm) {
      exactAlarm = v;
      if (routeName() === 'ajustes') render();
    }
  });
  syncOnline();
});

/* ---------- arranque ---------- */

setSaveErrorHandler(() => toast('⚠️ No pude guardar los cambios. Probá liberar espacio en el celular.'));
window.addEventListener('pagehide', () => flushNow());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushNow();
});

(async function init() {
  data = await loadAsync();
  try {
    navigator.storage?.persist?.(); // pide que Android no borre los datos si falta espacio
  } catch {
    /* no pasa nada */
  }
  await setupChannel();
  perm = await permissionState();
  exactAlarm = await exactAlarmState();
  onNotificationTap((plantId) => {
    if (getPlant(plantId)) go(`/p/${plantId}`);
    else if (getProject(plantId)) go(`/proyecto/${plantId}`);
  });
  const r = refreshCare(data, lookup);
  data.plants = r.plants;
  applyClimate();
  persist();
  await reschedule(data.plants, data.settings, extraAlerts());
  render();
  syncOnline();
})();
