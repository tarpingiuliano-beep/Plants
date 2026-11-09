import test from 'node:test';
import assert from 'node:assert/strict';
import { withChatRule, looksLikeQuestions, CHAT_RULE } from '../src/chat.js';
import { parseAnswer } from '../src/novedad.js';
import { parsePlan } from '../src/projects.js';

test('la regla pide todas las preguntas antes del bloque final', () => {
  const p = withChatRule('Respondé SOLO con un bloque JSON');
  assert.ok(p.includes(CHAT_RULE));
  assert.match(p, /TODAS tus preguntas juntas/);
  assert.match(p, /Recién cuando no te quede ninguna duda/);
});

test('si pega las preguntas de Gemini, la app lo avisa', () => {
  assert.ok(looksLikeQuestions('1. ¿Cada cuánto la regás?\n2. ¿Qué luz recibe?'));
  assert.ok(!looksLikeQuestions('{"resumen":"x"}'));
  assert.match(parseAnswer('1. ¿Cuánta luz recibe?').error, /pregunta de Gemini/);
  assert.match(parsePlan('¿Qué tierra usás?').error, /pregunta de Gemini/);
  assert.match(parseAnswer('hola').error, /No pude leer/);
});
