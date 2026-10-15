# Plantas 🌿

App Android para cuidar tus plantas. Sacás una foto, la app reconoce la especie y arma sola el plan de cuidados según dónde vive la planta y el clima de tu zona.

- **Reconocimiento:** PlantNet (clave gratuita que se carga en la app, en Ajustes; no se guarda en el repo).
- **Cuidados:** base offline de ~65 especies comunes (riego, luz, frío que tolera) con respaldo por género y familia para el resto. Cada especie que se suma queda guardada en el celular y, con wifi, se completa con una ficha de Wikipedia.
- **Clima:** Open-Meteo (sin clave). Ajusta la frecuencia de riego, avisa de heladas y de lluvia para plantas de afuera.
- **Avisos:** notificaciones locales (funcionan sin internet).
- **Datos:** quedan en el celular; no hay servidor ni cuenta.
- **APK:** se compila solo en GitHub Actions con cada push a `main`. Bajalo desde **Releases**.

## Desarrollo

```bash
npm install
npm run dev      # probar en el navegador (sin cámara ni notificaciones)
npm test         # tests de la lógica
npm run test:ui  # prueba de la interfaz con red simulada
npm run build    # genera dist/
```

## Firma del APK

`signing/debug.keystore` es una clave de **debug** pública a propósito: permite que cada build nuevo se instale encima del anterior sin perder datos. No sirve para publicar en Play Store.
