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

/** Borra las fotos que quedaron de compartidos anteriores. */
async function cleanSharedPhotos() {
  try {
    const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache });
    await Promise.all(
      files
        .filter((f) => /^novedad-.*\.jpg$/.test(f.name || f))
        .map((f) => Filesystem.deleteFile({ path: f.name || f, directory: Directory.Cache }).catch(() => {})),
    );
  } catch {
    /* no pasa nada */
  }
}

/**
 * Comparte fotos + texto con otra app (por ejemplo Gemini). Devuelve 'shared' | 'cancelled' | 'unsupported'.
 * Gemini suele ignorar el texto cuando llegan fotos, así que el texto también queda copiado para pegarlo.
 * Cada vez se usan nombres de archivo nuevos: con nombres fijos Android/Gemini volvían a mostrar las fotos de la primera vez.
 */
export async function sharePhotosWithText(text, dataUrls, title = 'Novedad de mi planta') {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  await cleanSharedPhotos();
  const stamp = Date.now().toString(36);
  const files = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const b64 = String(dataUrls[i]).split(',')[1] || '';
    const { uri } = await Filesystem.writeFile({ path: `novedad-${stamp}-${i + 1}.jpg`, data: b64, directory: Directory.Cache });
    files.push(uri);
  }
  await copyText(text);
  try {
    await Share.share({ title, text, files, dialogTitle: 'Compartir con Gemini' });
    return 'shared';
  } catch (e) {
    if (/cancel/i.test(String(e?.message || e))) return 'cancelled';
    throw e;
  }
}
