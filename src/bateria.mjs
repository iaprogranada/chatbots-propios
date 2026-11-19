#!/usr/bin/env node
// npm run bateria -- <negocio>  → hace las preguntas de pruebas/<negocio>.json al modelo real (GASTA API),
// cada una en una conversación nueva, y guarda respuestas y comprobaciones para que el agente Chatbots las revise.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cargarNegocios, textoDerivacion } from './negocios.mjs';
import { abrirAlmacen } from './almacen.mjs';
import { crearAsistente } from './asistente.mjs';

const id = process.argv[2];
const negocios = await cargarNegocios();
if (!negocios.has(id)) { console.error(`Uso: npm run bateria -- <negocio>. Negocios: ${[...negocios.keys()].join(', ')}`); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('Falta ANTHROPIC_API_KEY en .env'); process.exit(1); }

const { preguntas } = JSON.parse(await readFile(new URL(`../pruebas/${id}.json`, import.meta.url), 'utf8'));
const datos = process.env.DATOS ?? 'datos-chatbot';
const almacen = abrirAlmacen(join(datos, 'chatbot.db'));
if (!almacen.negocio(id).fuentes().length) { console.error(`${id} no tiene nada cargado: npm run cargar -- ${id}`); process.exit(1); }
// La batería no cuenta para los límites diarios del negocio: usa una ficha con topes altos.
const ficha = negocios.get(id);
const asistente = crearAsistente({ almacen, negocios: new Map([[id, { ...ficha, limites: { ...ficha.limites, mensajesPorDia: 1e6 } }]]), registrar: () => {} });
const derivacion = textoDerivacion(ficha).split(': ')[1]?.split(/, | o /)[0] ?? '';

const resultados = [];
let coste = 0;
for (const p of preguntas) {
  const r = await asistente.responder({ negocioId: id, mensaje: p.pregunta, origen: 'bateria' });
  const fallos = [];
  for (const f of p.espera ?? []) if (!r.respuesta.toLowerCase().includes(f.toLowerCase())) fallos.push(`falta «${f}»`);
  for (const f of p.noDebe ?? []) if (new RegExp(f, 'i').test(r.respuesta)) fallos.push(`contiene «${f}»`);
  if (p.derivar && derivacion && !r.respuesta.includes(derivacion)) fallos.push('no deriva a los contactos');
  resultados.push({ ...p, respuesta: r.respuesta, motivo: r.motivo, fuentes: r.fuentes, fallos });
  console.log(`${fallos.length ? '✗' : '✓'} [${p.grupo}] ${p.pregunta}\n    → ${r.respuesta}${r.motivo ? `  (${r.motivo})` : ''}${fallos.length ? `\n    ! ${fallos.join('; ')}` : ''}`);
}
for (const fila of almacen.leerTodo("SELECT coalesce(sum(coste),0) AS c FROM mensajes WHERE negocio_id = ? AND conversacion_id IN (SELECT id FROM conversaciones WHERE origen = 'bateria')", id)) coste = fila.c;
await mkdir(datos, { recursive: true });
const archivo = join(datos, `bateria-${id}-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`);
await writeFile(archivo, JSON.stringify({ negocio: id, fecha: new Date().toISOString(), coste, resultados }, null, 2));
const malas = resultados.filter((r) => r.fallos.length).length;
console.log(`\n${resultados.length - malas}/${resultados.length} sin fallos automáticos. Coste acumulado de las baterías: ${coste.toFixed(4)} $. Detalle: ${archivo}`);
console.log('Las comprobaciones automáticas no bastan: el agente Chatbots revisa a mano que no haya datos añadidos (A1, A2).');
almacen.cerrar();
