import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarNegocio } from '../src/cargar.mjs';
import { abrirAlmacen } from '../src/almacen.mjs';
import { normalizarFicha } from '../src/negocios.mjs';

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
