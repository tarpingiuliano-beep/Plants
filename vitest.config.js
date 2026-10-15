import { defineConfig } from 'vitest/config';

// Prueba de interfaz con red simulada (sin celular ni internet).
export default defineConfig({ test: { environment: 'jsdom', include: ['test-ui/**/*.spec.js'] } });
