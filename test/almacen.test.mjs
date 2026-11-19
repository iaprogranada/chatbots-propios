// A6 (datos): un negocio no puede ver ni usar lo de otro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirAlmacen } from '../src/almacen.mjs';

function preparar() {
  const almacen = abrirAlmacen();
  const a = almacen.negocio('negocio-a');
  const b = almacen.negocio('negocio-b');
  a.guardarFuente({ url: 'https://a.example/', titulo: 'Clínica A', trozos: [{ texto: 'La limpieza dental cuesta 45 euros en Málaga.' }] });
  b.guardarFuente({ url: 'https://b.example/', titulo: 'Ferretería B', trozos: [{ texto: 'Vendemos tornillos y taladros.' }] });
  return { almacen, a, b };
}

test('la búsqueda solo devuelve trozos del propio negocio', () => {
  const { a, b } = preparar();
  assert.equal(a.buscar('limpieza').length, 1);
  assert.equal(b.buscar('limpieza').length, 0);
  assert.equal(b.buscar('tornillos').length, 1);
  assert.equal(a.buscar('tornillos').length, 0);
});

test('busca sin tildes y sin mayúsculas', () => {
  const { a } = preparar();
  assert.equal(a.buscar('malaga').length, 1);
});

test('una conversación de A no existe para B', () => {
  const { a, b } = preparar();
  const c = a.nuevaConversacion('https://a.example');
  assert.ok(a.conversacion(c.id));
  assert.equal(b.conversacion(c.id), null);
  assert.throws(() => b.anotar({ conversacionId: c.id, rol: 'usuario', texto: 'hola' }), /otro negocio/);
  assert.deepEqual(b.historial(c.id), []);
});

test('recargar una URL sustituye sus trozos y no duplica', () => {
  const { almacen, a } = preparar();
  a.guardarFuente({ url: 'https://a.example/', titulo: 'Clínica A', trozos: [{ texto: 'Ortodoncia invisible.' }, { texto: 'Implantes.' }] });
  assert.equal(a.buscar('limpieza').length, 0);
  assert.equal(a.buscar('ortodoncia').length, 1);
  assert.equal(almacen.leerTodo("SELECT count(*) AS n FROM fragmentos WHERE negocio_id = 'negocio-a'")[0].n, 2);
  assert.equal(almacen.leerTodo('SELECT count(*) AS n FROM fragmentos_fts')[0].n, 3);
});

test('el uso se cuenta por negocio y el gasto del día suma todos', () => {
  const { almacen, a, b } = preparar();
  a.sumarUso('2026-11-19', { mensajes: 1, llamadas: 1, coste: 0.001 });
  a.sumarUso('2026-11-19', { mensajes: 1, llamadas: 1, coste: 0.002 });
  b.sumarUso('2026-11-19', { mensajes: 1 });
  assert.equal(a.uso('2026-11-19').mensajes, 2);
  assert.equal(b.uso('2026-11-19').llamadas, 0);
  assert.ok(Math.abs(almacen.gastoDia('2026-11-19') - 0.003) < 1e-9);
});

test('rechaza un negocio_id que no es un identificador', () => {
  const almacen = abrirAlmacen();
  assert.throws(() => almacen.negocio("a' OR 1=1 --"), /no válido/);
});
