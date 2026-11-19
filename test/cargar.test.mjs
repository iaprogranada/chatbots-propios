import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarNegocio } from '../src/cargar.mjs';
import { abrirAlmacen } from '../src/almacen.mjs';
import { normalizarFicha, quitarOcultos, contieneOculto, validarFicha } from '../src/negocios.mjs';

const html = (t) => `<html><head><title>${t}</title></head><body><h1>${t}</h1><p>${`Texto de ${t} con información del negocio. `.repeat(12)}</p></body></html>`;
const web = (urls) => async () => ({ paginas: urls.map((url) => ({ url, html: html(url) })), descartadas: [] });

test('«excluir» deja fuera páginas de ejemplo y borra lo que ya no se carga', async () => {
  const almacen = abrirAlmacen();
  const n = almacen.negocio('solar');
  const ficha = normalizarFicha({ id: 'solar', urls: ['https://solar.example/'] });
  const todas = ['https://solar.example/', 'https://solar.example/tarifas', 'https://solar.example/v/ejemplo', 'https://solar.example/en.html'];
  await cargarNegocio(ficha, n, { rastrear: web(todas), registrar: () => {} });
  assert.equal(n.fuentes().length, 4);

  const r = await cargarNegocio({ ...ficha, excluir: ['https://solar.example/v/', 'https://solar.example/en.html'] }, n, { rastrear: web(todas), registrar: () => {} });
  assert.deepEqual(n.fuentes().map((f) => f.url), ['https://solar.example/', 'https://solar.example/tarifas']);
  assert.deepEqual(r.borradas.sort(), ['https://solar.example/en.html', 'https://solar.example/v/ejemplo']);
  assert.equal(n.buscar('"ejemplo"*').length, 0);
  almacen.cerrar();
});

test('«ocultar» quita de la base los textos que el dueño no quiere que el bot repita', async () => {
  const almacen = abrirAlmacen();
  const n = almacen.negocio('solar');
  const ficha = normalizarFicha({ id: 'solar', urls: ['https://solar.example/'], ocultar: ['Calle Mayor, 3'] });
  const rastrear = async () => ({ paginas: [{ url: 'https://solar.example/', html: `<html><body><h1>Solar</h1><p>Estamos en Calle Mayor, 3, Granada. ${'Instalamos placas solares. '.repeat(15)}</p></body></html>` }], descartadas: [] });
  await cargarNegocio(ficha, n, { rastrear, registrar: () => {} });
  const texto = n.buscar('"granada"*').map((t) => t.texto).join(' ');
  assert.match(texto, /Estamos en Granada/);
  assert.ok(!/Mayor/.test(texto));
  assert.equal(quitarOcultos('en calle mayor, 3. Granada', ['Calle Mayor, 3']), 'en Granada');
  assert.ok(contieneOculto('Vamos a CALLE MAYOR, 3', ['Calle Mayor, 3']));
  assert.ok(validarFicha({ ...ficha, derivacion: { web: 'https://solar.example' }, dominios: [], ocultar: ['x'] }, 'solar').some((e) => e.startsWith('ocultar')));
  almacen.cerrar();
});
