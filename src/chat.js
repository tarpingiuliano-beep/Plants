/* Pedidos que el usuario lleva a mano a la app de Gemini (copiar/compartir): ahí Gemini puede conversar,
   así que primero tiene que sacarse TODAS las dudas y recién después dar el bloque final para pegar en la app. */

export const CHAT_RULE = `REGLA IMPORTANTE (tiene prioridad sobre cualquier otra instrucción de este mensaje sobre responder solo con el bloque JSON):
1) Si para darme un diagnóstico o un plan sólido te falta cualquier dato (cuánta luz recibe, cada cuánto la riego, tipo de maceta o tierra, desde cuándo pasa, qué productos usé, etc.), NO escribas todavía el bloque JSON. Primero hacé TODAS tus preguntas juntas, en una lista numerada, y esperá mi respuesta.
2) Si mis respuestas te generan nuevas dudas, preguntalas también antes de cerrar.
3) Recién cuando no te quede ninguna duda, mandame el resultado final: únicamente el bloque JSON con la forma pedida, dentro de un bloque de código, listo para copiar y pegar en mi app, sin texto antes ni después y sin preguntas al pie.
4) Si ya tenés todo lo que necesitás, mandá directamente el bloque JSON.`;

export const withChatRule = (prompt) => `${prompt}\n\n${CHAT_RULE}`;

/** ¿Lo que pegó parece ser una pregunta de Gemini y no el bloque final? */
export const looksLikeQuestions = (raw) => {
  const t = String(raw || '');
  return !t.includes('{') && (t.includes('?') || /pregunt|necesito saber|me ayudar[ií]a saber/i.test(t));
};

export const QUESTIONS_MSG = 'Eso parece ser una pregunta de Gemini, no el resultado final. Respondele en su chat; cuando termine, te manda el bloque final: ese es el que tenés que pegar acá.';
