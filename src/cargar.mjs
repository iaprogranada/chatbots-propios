#!/usr/bin/env node
// npm run cargar -- <negocio_id>  → rastrea las urls de su ficha, trocea y guarda en la base (sustituye lo anterior).
import { join } from 'node:path';
import { cargarNegocios, quitarOcultos } from './negocios.mjs';
import { abrirAlmacen } from './almacen.mjs';
import { rastrear as rastrearWeb } from './carga/rastrear.mjs';
import { trocearSitio } from './carga/trocear.mjs';

export async function cargarNegocio(ficha, negocioDb, { rastrear = rastrearWeb, registrar = console.log } = {}) {
  const resumen = { paginas: 0, trozos: 0, avisos: [], borradas: [] };
  // «excluir» de la ficha: prefijos de URL que no son información del negocio (ejemplos ficticios, traducciones…).
  const excluida = (u) => (ficha.excluir ?? []).some((pre) => u.startsWith(pre));
  const cargadas = new Set();
  for (const url of ficha.urls) {
    const r = await rastrear(url, { max: ficha.maxPaginas, registrar });
    for (const d of r.descartadas) registrar(`  descartada ${d.url} (${d.motivo})`);
    const paginas = r.paginas.filter((p) => {
      if (excluida(p.url)) { registrar(`  excluida ${p.url} (ficha)`); return false; }
      return true;
    });
    for (const p of trocearSitio(paginas)) {
      const palabras = p.trozos.reduce((n, t) => n + t.texto.split(/\s+/).length, 0);
      // Una página casi vacía en crudo suele ser una web que solo pinta con JavaScript.
      if (palabras < 50) resumen.avisos.push(`${p.url}: solo ${palabras} palabras (¿la web necesita JavaScript?)`);
      for (const o of p.ordenesQuitadas) resumen.avisos.push(`${p.url}: quitada una posible orden para el bot: «${o.slice(0, 120)}»`);
      if (!p.trozos.length) continue;
      const trozos = p.trozos.map((t) => ({ ...t, texto: quitarOcultos(t.texto, ficha.ocultar) }));
      resumen.trozos += negocioDb.guardarFuente({ url: p.url, titulo: p.titulo, trozos });
      cargadas.add(p.url);
      resumen.paginas++;
    }
  }
  // Lo que se cargó antes y ya no (excluido o desaparecido) se borra: la base refleja la web de hoy.
  for (const f of negocioDb.fuentes()) {
    if (f.tipo === 'web' && !cargadas.has(f.url)) { negocioDb.borrarFuente(f.url); resumen.borradas.push(f.url); }
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
  for (const u of r.borradas) console.log(`Borrada de la base (ya no se carga): ${u}`);
  console.log(`${id}: ${r.paginas} páginas, ${r.trozos} trozos guardados.`);
  almacen.cerrar();
}
