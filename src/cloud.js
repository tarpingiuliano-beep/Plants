/* Respaldo automático en un repositorio PRIVADO de GitHub del propio usuario (API de contenidos).
   El token y el repo se guardan solo en el celular (keys), nunca dentro del respaldo. */
import { netFetch } from './http.js';
import { parseBackup } from './backup.js';

export const CLOUD_FILE = 'respaldo-plantas.json';
export const CLOUD_EVERY_HOURS = 20;
const API = 'https://api.github.com';

/** Base64 de un texto UTF-8 (por tramos, para no reventar con respaldos grandes). */
export function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const validRepo = (r) => /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(r || '').trim());

const headers = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...extra,
});

async function errText(res) {
  try {
    const j = JSON.parse(await res.text());
    return j.message || '';
  } catch {
    return '';
  }
}

export function explain(status, msg = '') {
  if (status === 401) return 'GitHub no aceptó el token (vencido o mal copiado).';
  if (status === 403) return `El token no tiene permiso de escritura en ese repositorio${msg ? ` (${msg})` : ''}. Revisá que tenga "Contents: Read and write".`;
  if (status === 404) return 'No encuentro ese repositorio con ese token. Revisá el nombre (usuario/repo) y que el token tenga acceso a él.';
  if (status === 409 || status === 422) return `GitHub rechazó el archivo (${msg || status}). Probá de nuevo.`;
  return `GitHub respondió error ${status}${msg ? `: ${msg}` : ''}.`;
}

/** ¿Toca hacer el respaldo automático ahora? */
export function cloudDue(keys, last, now = new Date(), auto = true) {
  if (!auto || !keys?.github || !validRepo(keys?.githubRepo)) return false;
  if (!last) return true;
  const t = Date.parse(last);
  return Number.isNaN(t) || now.getTime() - t >= CLOUD_EVERY_HOURS * 3600000;
}

/** Sube (crea o actualiza) el respaldo. Devuelve { ok } o { ok:false, error }. */
export async function pushBackup({ token, repo, text, now = new Date() }, f = netFetch) {
  const url = `${API}/repos/${repo.trim()}/contents/${CLOUD_FILE}`;
  try {
    let sha;
    const meta = await f(url, { headers: headers(token) });
    if (meta.ok) sha = (await meta.json()).sha;
    else if (meta.status !== 404) return { ok: false, error: explain(meta.status, await errText(meta)) };
    const res = await f(url, {
      method: 'PUT',
      headers: headers(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: `Respaldo ${now.toISOString()}`, content: toBase64Utf8(text), ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) return { ok: false, error: explain(res.status, await errText(res)) };
    return { ok: true };
  } catch {
    return { ok: false, error: 'No pude conectarme con GitHub.' };
  }
}

/** Baja el último respaldo y lo valida. { ok, backup } o { ok:false, error }. */
export async function pullBackup({ token, repo }, f = netFetch) {
  try {
    const res = await f(`${API}/repos/${repo.trim()}/contents/${CLOUD_FILE}`, { headers: headers(token, { Accept: 'application/vnd.github.raw+json' }) });
    if (res.status === 404) return { ok: false, error: 'Todavía no hay un respaldo en ese repositorio (o no encuentro el repositorio).' };
    if (!res.ok) return { ok: false, error: explain(res.status, await errText(res)) };
    return parseBackup(await res.text());
  } catch {
    return { ok: false, error: 'No pude conectarme con GitHub.' };
  }
}
