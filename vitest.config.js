import { defineConfig } from 'vitest/config';

// Prueba de interfaz con red simulada (sin celular ni internet).
export default defineConfig({ define: { __BUILD__: JSON.stringify('test') }, test: { environment: 'jsdom', include: ['test-ui/**/*.spec.js'] } });
