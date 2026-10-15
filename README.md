# Plantas 🌿

App Android para cuidar tus plantas: foto, frecuencia de riego, notificaciones locales e historial.

- **Stack:** Vite + JavaScript, empaquetada con Capacitor. Notificaciones locales (funcionan sin internet).
- **Datos:** se guardan en el celular (no hay servidor ni cuenta).
- **APK:** se compila solo en GitHub Actions con cada push a `main`. Bajalo desde la sección **Releases** del repo.

## Desarrollo

```bash
npm install
npm run dev     # probar en el navegador (sin notificaciones)
npm test        # tests de la lógica
npm run build   # genera dist/
```

## Firma del APK

`signing/debug.keystore` es una clave de **debug** pública a propósito: permite que cada build nuevo se instale encima del anterior sin perder datos. No sirve para publicar en Play Store.
