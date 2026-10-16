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
