#!/usr/bin/env node
// npm run cargar -- <negocio_id>  → rastrea las urls de su ficha, trocea y guarda en la base (sustituye lo anterior).
import { join } from 'node:path';
import { cargarNegocios } from './negocios.mjs';
import { abrirAlmacen } from './almacen.mjs';
import { rastrear as rastrearWeb } from './carga/rastrear.mjs';
import { trocearSitio } from './carga/trocear.mjs';

export async function cargarNegocio(ficha, negocioDb, { rastrear = rastrearWeb, registrar = console.log } = {}) {
  const resumen = { paginas: 0, trozos: 0, avisos: [] };
  for (const url of ficha.urls) {
    const r = await rastrear(url, { max: ficha.maxPaginas, registrar });
    for (const d of r.descartadas) registrar(`  descartada ${d.url} (${d.motivo})`);
    for (const p of trocearSitio(r.paginas)) {
      const palabras = p.trozos.reduce((n, t) => n + t.texto.split(/\s+/).length, 0);
      // Una página casi vacía en crudo suele ser una web que solo pinta con JavaScript.
      if (palabras < 50) resumen.avisos.push(`${p.url}: solo ${palabras} palabras (¿la web necesita JavaScript?)`);
      if (!p.trozos.length) continue;
      resumen.trozos += negocioDb.guardarFuente({ url: p.url, titulo: p.titulo, trozos: p.trozos });
      resumen.paginas++;
    }
  }
  return resumen;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const id = process.argv[2];
  const negocios = await cargarNegocios();
  if (!negocios.has(id)) {
    console.error(`Uso: npm run cargar -- <negocio>. Negocios: ${[...negocios.keys()].join(', ')}`);
    process.exit(1);
  }
  const almacen = abrirAlmacen(join(process.env.DATOS ?? 'datos-chatbot', 'chatbot.db'));
  const r = await cargarNegocio(negocios.get(id), almacen.negocio(id));
  for (const a of r.avisos) console.warn(`Aviso: ${a}`);
  console.log(`${id}: ${r.paginas} páginas, ${r.trozos} trozos guardados.`);
  almacen.cerrar();
}
