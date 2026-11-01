/* Pedidos de red. En el celular, los GET van directo por el plugin nativo de HTTP de Capacitor.
   Motivo: el "fetch" parcheado de Capacitor manda los GET por un proxy interno que solo existe cuando la app
   se carga desde el celular; en la versión en línea (GitHub Pages) ese proxy da error 404. */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** Respuesta mínima con la forma de fetch (ok, status, json, text, headers). */
function wrap(r) {
  const data = r.data;
  const asText = () => (typeof data === 'string' ? data : data == null ? '' : JSON.stringify(data));
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: { get: (k) => r.headers?.[k] ?? r.headers?.[String(k).toLowerCase()] ?? null },
    json: async () => (typeof data === 'string' ? JSON.parse(data) : data),
    text: async () => asText(),
  };
}

/** Arma la función de red: GET → nativo (si hay), el resto → fetch normal. */
export function makeFetch(native, fallback) {
  return async (url, opts = {}) => {
    const method = String(opts.method || 'GET').toUpperCase();
    if (native && method === 'GET' && !opts.body) {
      const r = await native.request({ url: String(url), method: 'GET', headers: opts.headers || {}, responseType: 'text' });
      return wrap(r);
    }
    return fallback(url, opts);
  };
}

export const netFetch = makeFetch(Capacitor.isNativePlatform() ? CapacitorHttp : null, (...a) => fetch(...a));
