import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Guarda el texto como archivo y abre el menú de compartir (Drive, WhatsApp, Archivos…). */
export async function shareTextFile(name, text) {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, dialogTitle: 'Guardar respaldo', files: [uri] });
    } catch (e) {
      // Cerrar el menú sin elegir no es un error
      if (/cancel/i.test(String(e?.message || e))) return 'cancelled';
      throw e;
    }
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'downloaded';
}

/** Copia texto al portapapeles. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch {
      return false;
    }
  }
}

/** Comparte fotos + texto con otra app (por ejemplo Gemini). Devuelve 'shared' | 'cancelled' | 'unsupported'. */
export async function sharePhotosWithText(text, dataUrls, title = 'Novedad de mi planta') {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  const files = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const b64 = String(dataUrls[i]).split(',')[1] || '';
    const { uri } = await Filesystem.writeFile({ path: `novedad-${i + 1}.jpg`, data: b64, directory: Directory.Cache });
    files.push(uri);
  }
  try {
    await Share.share({ title, text, files, dialogTitle: 'Compartir con Gemini' });
    return 'shared';
  } catch (e) {
    if (/cancel/i.test(String(e?.message || e))) return 'cancelled';
    throw e;
  }
}
