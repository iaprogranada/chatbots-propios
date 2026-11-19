import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarNegocios, validarFicha, textoDerivacion, normalizarFicha } from '../src/negocios.mjs';

const buena = {
  id: 'bar-pepe', nombre: 'Bar Pepe', tono: 'cercano', derivacion: { telefono: '958 000 000' },
  dominios: ['https://barpepe.es'], urls: ['https://barpepe.es/'],
};

test('las fichas del repositorio son válidas', async () => {
  const negocios = await cargarNegocios();
  assert.ok(negocios.has('iapro'));
  assert.ok(negocios.has('prueba-b'));
  assert.equal(negocios.get('iapro').limites.mensajesPorConversacion, 20);
});

test('una ficha correcta no da errores', () => {
  assert.deepEqual(validarFicha(buena, 'bar-pepe'), []);
});

test('sin canal de derivación no se acepta (regla 1 y 4)', () => {
  const errores = validarFicha({ ...buena, derivacion: { telefono: ' ' } }, 'bar-pepe');
  assert.ok(errores.some((e) => e.startsWith('derivacion')));
});

test('detecta id, tono, horario, dominios y límites mal puestos', () => {
  const errores = validarFicha({
    ...buena, id: 'Bar Pepe', tono: 'gracioso',
    horario: { zona: 'Europe/Madrid', dias: { miércoles: [['14:00', '09:00']] } },
    dominios: ['https://barpepe.es/'], limites: { mensajesPorDia: 0, otro: 3 },
  }, 'bar-pepe');
  for (const campo of ['id', 'tono', 'horario.dias.miércoles', 'dominios', 'limites.mensajesPorDia', 'limites.otro']) {
    assert.ok(errores.some((e) => e.startsWith(campo)), `falta el error de ${campo}`);
  }
});

test('la derivación usa solo los canales de la ficha y el tono', () => {
  const formal = normalizarFicha({ ...buena, tono: 'formal', derivacion: { telefono: '958 000 000', email: 'hola@barpepe.es' } });
  assert.equal(textoDerivacion(formal), 'Puede contactar con una persona del equipo de Bar Pepe en: teléfono 958 000 000 o correo hola@barpepe.es.');
  assert.match(textoDerivacion(normalizarFicha(buena)), /^Puedes hablar/);
});
