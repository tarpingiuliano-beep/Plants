import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, templateById, parsePlan, buildPlanPrompt, stageTask, stageState, planDays, createProject, projectProgress, addLog } from '../src/projects.js';

test('plantilla de pera con bonsái agrega etapas largas', () => {
  const t = templateById('estratificacion');
  const base = t.build({});
  const bon = t.build({ bonsai: true });
  assert.ok(bon.etapas.length > base.etapas.length);
  assert.ok(planDays(bon) > 1000);
  assert.ok(planDays(base) >= 90);
});

test('stageTask: inicio hoy y repetición', () => {
  const s = { dia: 7, titulo: 'x', detalle: '', cada: 7, veces: 8 };
  const t = stageTask(s, '2026-10-29', '2026-10-29');
  assert.equal(t.due, '2026-11-05');
  assert.equal(t.left, 8);
});

test('stageTask: proyecto ya empezado saltea repeticiones pasadas', () => {
  const s = { dia: 7, titulo: 'x', detalle: '', cada: 7, veces: 8 };
  const t = stageTask(s, '2026-10-01', '2026-10-29'); // día 28
  assert.equal(t.due, '2026-10-29'); // k=3 → día 28
  assert.equal(t.left, 5);
  assert.equal(stageTask({ dia: 0, titulo: 'a', detalle: '', cada: null, veces: null }, '2026-10-01', '2026-10-29'), null);
  assert.equal(stageTask({ dia: 7, titulo: 'a', detalle: '', cada: 7, veces: 2 }, '2026-01-01', '2026-10-29'), null);
});

test('stageState', () => {
  const s = { dia: 10, titulo: 'x', detalle: '', cada: null, veces: null };
  assert.equal(stageState(s, '2026-10-29', '2026-11-01'), 'futura');
  assert.equal(stageState(s, '2026-10-29', '2026-11-08'), 'en curso');
  assert.equal(stageState(s, '2026-10-29', '2026-11-20'), 'pasada');
});

test('parsePlan valida y normaliza', () => {
  const raw = '```json\n' + JSON.stringify({ resumen: 'r', etapas: [{ dia: 14, titulo: 'b', detalle: 'd', cada_dias: 0 }, { dia: 0, titulo: 'a', detalle: 'd', cada_dias: 7, veces: 3 }, { dia: 'x', titulo: 'mal' }], seguridad: 'alta' }) + '\n```';
  const r = parsePlan(raw);
  assert.ok(r.ok);
  assert.deepEqual(r.plan.etapas.map((e) => e.titulo), ['a', 'b']);
  assert.equal(r.plan.etapas[1].cada, null);
  assert.equal(r.plan.confidence, 'alta');
  assert.equal(r.plan.source, 'Gemini');
  assert.equal(parsePlan('hola').ok, false);
  assert.equal(parsePlan('').ok, false);
});

test('prompt, proyecto y diario', () => {
  const p = buildPlanPrompt({ name: 'Peras', description: 'frío', startDate: '2026-10-01', today: '2026-10-29' });
  assert.match(p, /ya empezó/);
  const plan = templateById('palta').build();
  const pr = createProject({ name: 'Palta', startDate: '2026-10-20', plan });
  assert.match(pr.id, /^j/);
  assert.equal(projectProgress(pr, '2026-10-29').day, 9);
  assert.equal(addLog(pr, { text: 'hola' }).log.length, 1);
  assert.equal(TEMPLATES.length, 2);
});

test('parsePlan acepta el formato alternativo de Gemini (steps / scheduled_date / instructions)', async () => {
  const { parsePlan } = await import('../src/projects.js');
  const raw = JSON.stringify({
    start_date: '2026-11-23', recurring_care: { watering_interval_days: 12, watering_condition: 'only_when_completely_dry' },
    steps: [
      { step_number: 1, title: 'Cicatrizar', scheduled_date: '2026-11-23', instructions: ['Dejar secar.', 'Sombra.'] },
      { step_number: 3, title: 'Primer riego', scheduled_date: '2026-12-05', instructions: ['Riego suave.'] },
      { step_number: 4, title: 'Verificar', scheduled_date: '2026-12-23', instructions: ['Tocar.'] },
    ],
  });
  const r = parsePlan(raw, '2026-11-25');
  assert.ok(r.ok);
  assert.deepEqual(r.plan.etapas.map((e) => e.dia), [0, 12, 30]);
  assert.equal(r.plan.etapas[0].detalle, 'Dejar secar. Sombra.');
  assert.match(r.plan.consejos.at(-1), /cada 12 días.*seco/);
});
