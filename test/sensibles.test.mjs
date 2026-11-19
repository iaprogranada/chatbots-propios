// A4: un DNI o un IBAN no se repite ni queda en claro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enmascarar, dniValido } from '../src/sensibles.mjs';

const casos = [
  ['Mi DNI es 12345678Z', 'dni', '12345678Z'],
  ['dni 12345678-z por favor', 'dni', '12345678-z'],
  ['NIE X1234567L', 'dni', 'X1234567L'],
  ['Mi cuenta es ES91 2100 0418 4502 0005 1332', 'iban', 'ES91 2100 0418 4502 0005 1332'],
  ['IBAN ES9121000418450200051332', 'iban', 'ES9121000418450200051332'],
  ['Cuenta alemana DE89 3704 0044 0532 0130 00', 'iban', 'DE89 3704 0044 0532 0130 00'],
  ['La tarjeta 4111 1111 1111 1111 caduca pronto', 'tarjeta', '4111 1111 1111 1111'],
  ['mi contraseña es Gato1234!', 'contraseña', 'Gato1234!'],
  ['Password: hunter2', 'contraseña', 'hunter2'],
  ['Me han diagnosticado diabetes el mes pasado', 'salud', 'diabetes'],
];

for (const [texto, tipo, dato] of casos) {
  test(`oculta ${tipo}: «${texto}»`, () => {
    const r = enmascarar(texto);
    assert.ok(r.tipos.includes(tipo), `no detectó ${tipo}`);
    assert.ok(!r.texto.includes(dato), `queda en claro: ${r.texto}`);
  });
}

test('no toca lo que no es sensible', () => {
  for (const texto of [
    '¿Cuánto cuesta una web? Mi teléfono es 958 123 456',
    'Quiero 3 placas de 450 W para 2025',
    '¿Hacéis tratamientos de ortodoncia?',
    'Tengo un restaurante en Granada',
    'Referencia del pedido 2024-11-19',
  ]) {
    const r = enmascarar(texto);
    assert.deepEqual(r.tipos, [], texto);
    assert.equal(r.texto, texto);
  }
});

test('la letra de control del DNI se comprueba bien', () => {
  assert.ok(dniValido('12345678Z'));
  assert.ok(!dniValido('12345678A'));
  assert.ok(dniValido('X1234567L'));
});
