// A7: superado un límite, aviso y ninguna llamada al modelo (la parte de «ninguna llamada» está en chat.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comprobarLimites } from '../src/limites.mjs';
import { estaAbierto, describirHorario, diaDe } from '../src/horario.mjs';
import { normalizarFicha } from '../src/negocios.mjs';

const ficha = normalizarFicha({
  id: 'bar-pepe', nombre: 'Bar Pepe', tono: 'cercano', derivacion: { telefono: '958 000 000' },
  dominios: [], urls: [], limites: { mensajesPorConversacion: 3, mensajesPorDia: 10, caracteresPorMensaje: 50 },
  horario: { zona: 'Europe/Madrid', dias: { lunes: [['09:00', '14:00']], sabado: [['10:00', '13:00']] } },
});
const base = { ficha, mensaje: 'hola', conversacion: { mensajes: 0 }, usoHoy: { mensajes: 0 } };

test('dentro de los límites pasa', () => assert.deepEqual(comprobarLimites(base), { ok: true }));

for (const [nombre, cambio, motivo] of [
  ['mensaje vacío', { mensaje: '   ' }, 'mensaje-vacio'],
  ['mensaje largo', { mensaje: 'x'.repeat(51) }, 'mensaje-largo'],
  ['tope por conversación', { conversacion: { mensajes: 3 } }, 'tope-conversacion'],
  ['tope diario', { usoHoy: { mensajes: 10 } }, 'tope-dia'],
  ['tope de gasto global', { gastoDia: 2, topeGasto: 2 }, 'tope-gasto'],
]) {
  test(`corta por ${nombre}`, () => {
    const r = comprobarLimites({ ...base, ...cambio });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, motivo);
    assert.ok(r.respuesta.length > 10);
  });
}

test('los topes derivan con los contactos de la ficha', () => {
  assert.match(comprobarLimites({ ...base, usoHoy: { mensajes: 10 } }).respuesta, /958 000 000/);
});

test('horario en hora de Madrid, con cambio de hora', () => {
  // Lunes 17-nov-2026 08:30 UTC = 09:30 en Madrid (invierno, UTC+1)
  assert.equal(estaAbierto(ficha.horario, new Date('2026-11-16T08:30:00Z')), true);
  assert.equal(estaAbierto(ficha.horario, new Date('2026-11-16T13:30:00Z')), false); // 14:30
  // Lunes 15-jun-2026 12:30 UTC = 14:30 en Madrid (verano, UTC+2)
  assert.equal(estaAbierto(ficha.horario, new Date('2026-06-15T12:30:00Z')), false);
  assert.equal(estaAbierto(ficha.horario, new Date('2026-11-17T10:00:00Z')), false); // martes
  assert.equal(estaAbierto(null), null);
});

test('describe el horario y el día natural', () => {
  assert.match(describirHorario(ficha.horario), /^lunes: 09:00 a 14:00; martes: cerrado/);
  assert.equal(diaDe(new Date('2026-11-19T23:30:00Z')), '2026-11-20');
});
