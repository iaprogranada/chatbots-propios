#!/usr/bin/env node
// Servicio HTTP del chatbot (mismo estilo que auditor-aeo/src/servicio/servidor.mjs, sin framework).
//   GET  /salud   → estado
//   POST /chat    → { negocio_id, conversacion_id?, mensaje } → { conversacion_id, respuesta }
//   GET  /widget.js, /publico/<archivo>   → el widget y sus imágenes
//   GET  /widget/config?negocio=<id>      → lo que pinta el widget (datos públicos de la ficha)
//   GET  /prueba/<id>                      → página de prueba con el widget del negocio
// CORS: un navegador solo puede llamar desde los dominios de la ficha del negocio. Sin cabecera Origin (curl,
// pruebas en el servidor) se acepta; los límites por negocio y el tope de gasto protegen igual.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarNegocios, textoDerivacion } from './negocios.mjs';
import { abrirAlmacen } from './almacen.mjs';
import { crearAsistente } from './asistente.mjs';

const PUBLICO = new URL('../publico/', import.meta.url);
const TIPOS = { js: 'text/javascript; charset=utf-8', png: 'image/png' };
const AVISO = 'Asistente con IA: puede equivocarse. No escribas DNI, cuentas bancarias ni datos de salud.';

// Texto oscuro o blanco sobre el color de acento, el que más contraste dé.
export function colorTexto(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#1a0d00' : '#FFFFFF';
}

// Solo datos públicos: nada de instrucciones, límites internos ni urls de carga.
export function configWidget(ficha) {
  const w = ficha.widget ?? {};
  const color = /^#[0-9a-fA-F]{6}$/.test(w.color ?? '') ? w.color : '#14A8FF';
  return {
    nombre: ficha.nombre,
    saludo: w.saludo ?? `¡Hola! Soy el asistente virtual (IA) de ${ficha.nombre}. ¿En qué puedo ayudarte?`,
    color,
    colorTexto: colorTexto(color),
    etiqueta: w.etiqueta ?? `ATENCIÓN · ${ficha.nombre.toUpperCase()}`,
    boton: w.boton ?? (ficha.tono === 'formal' ? '¿Le ayudamos?' : '¿Hablamos?'),
    botones: Array.isArray(w.botones) ? w.botones.slice(0, 4) : [],
    avatarBusto: `/publico/${w.avatarBusto ?? 'avatar-busto.png'}`,
    avatarCabeza: `/publico/${w.avatarCabeza ?? 'avatar-cabeza.png'}`,
    aviso: AVISO,
    textoError: `Ahora mismo no puedo responder. ${textoDerivacion(ficha)}`,
    maxCaracteres: ficha.limites.caracteresPorMensaje,
  };
}

const paginaPrueba = (ficha) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Prueba del chat · ${ficha.nombre.replace(/[<&"]/g, '')}</title>
<style>body{margin:0;min-height:100vh;background:#020812;color:#F2F4F8;font:16px/1.5 Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}main{max-width:520px}h1{font-size:24px}p{color:#AEB8C8}</style>
</head><body><main><h1>Página de prueba del chat</h1><p>Esta página no es pública: sirve para probar el asistente antes de ponerlo en la web. Pulsa el botón de abajo a la derecha.</p></main>
<script src="/widget.js" data-negocio="${ficha.id}" defer></script></body></html>`;

async function leerJson(req, limite = 16 * 1024) {
  let crudo = '';
  for await (const trozo of req) {
    crudo += trozo;
    if (crudo.length > limite) throw Object.assign(new Error('cuerpo demasiado grande'), { codigo: 413 });
  }
  return crudo ? JSON.parse(crudo) : {};
}

export async function crearServicio({ env = process.env, negocios, almacen, pedir, registrar = console.log, reloj } = {}) {
  negocios ??= await cargarNegocios();
  almacen ??= abrirAlmacen(join(env.DATOS ?? 'datos-chatbot', 'chatbot.db'));
  const asistente = crearAsistente({ almacen, negocios, env, pedir, registrar, reloj });
  // Origen del propio servicio (p. ej. https://chat.iapro.top): la página de prueba llama desde ahí.
  const propio = env.URL_PUBLICA ?? null;

  const responder = (res, codigo, cuerpo, cabeceras = {}) => res
    .writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabeceras })
    .end(JSON.stringify(cuerpo));

  const servidor = createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && pathname === '/salud') return responder(res, 200, { ok: true, negocios: negocios.size, modelo: asistente.activo });
      if (req.method === 'GET' && (pathname === '/widget.js' || pathname.startsWith('/publico/'))) {
        const archivo = pathname === '/widget.js' ? 'widget.js' : pathname.slice('/publico/'.length);
        if (!/^[a-z0-9-]+\.(js|png)$/.test(archivo)) return responder(res, 404, { error: 'no encontrado' });
        const contenido = await readFile(new URL(archivo, PUBLICO)).catch(() => null);
        if (!contenido) return responder(res, 404, { error: 'no encontrado' });
        return res.writeHead(200, {
          'content-type': TIPOS[archivo.split('.').pop()], 'cache-control': 'public, max-age=300',
          'cross-origin-resource-policy': 'cross-origin', 'access-control-allow-origin': '*',
        }).end(contenido);
      }
      if (req.method === 'GET' && pathname === '/widget/config') {
        const ficha = negocios.get(searchParams.get('negocio'));
        if (!ficha) return responder(res, 404, { error: 'negocio no encontrado' }, { 'access-control-allow-origin': '*' });
        return responder(res, 200, configWidget(ficha), { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' });
      }
      if (req.method === 'GET' && pathname.startsWith('/prueba/')) {
        const ficha = negocios.get(pathname.slice('/prueba/'.length));
        if (!ficha) return responder(res, 404, { error: 'negocio no encontrado' });
        return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }).end(paginaPrueba(ficha));
      }
      if (pathname !== '/chat') return responder(res, 404, { error: 'no encontrado' });

      const origen = req.headers.origin ?? null;
      const cors = origen ? { 'access-control-allow-origin': origen, vary: 'Origin' } : {};
      if (req.method === 'OPTIONS') {
        // El preflight aún no sabe el negocio: se acepta cualquier origen de alguna ficha, y el POST lo concreta.
        const conocido = origen && (origen === propio || [...negocios.values()].some((f) => f.dominios.includes(origen)));
        if (!conocido) return res.writeHead(403).end();
        return res.writeHead(204, { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' }).end();
      }
      if (req.method !== 'POST') return responder(res, 405, { error: 'método no permitido' });

      const cuerpo = await leerJson(req);
      const ficha = negocios.get(cuerpo.negocio_id);
      if (!ficha) return responder(res, 404, { error: 'negocio no encontrado' });
      if (origen && origen !== propio && !ficha.dominios.includes(origen)) return responder(res, 403, { error: 'dominio no autorizado' });
      if (typeof cuerpo.mensaje !== 'string') return responder(res, 400, { error: 'falta el mensaje' }, cors);

      const r = await asistente.responder({
        negocioId: ficha.id, conversacionId: cuerpo.conversacion_id ?? null, mensaje: cuerpo.mensaje, origen,
      });
      if (r.error === 'conversacion-no-valida') return responder(res, 404, { error: 'conversación no encontrada' }, cors);
      return responder(res, 200, { conversacion_id: r.conversacionId, respuesta: r.respuesta }, cors);
    } catch (e) {
      registrar(`Error ${req.method} ${pathname}: ${e.message}`);
      return responder(res, e.codigo ?? 400, { error: 'petición no válida' });
    }
  });

  return {
    servidor,
    almacen,
    escuchar: (puerto = Number(env.PUERTO ?? 8090), host = env.HOST ?? '127.0.0.1') => new Promise((ok) => servidor.listen(puerto, host, () => ok(servidor.address().port))),
    cerrar: () => new Promise((ok) => servidor.close(ok)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.ANTHROPIC_API_KEY) console.warn('Sin ANTHROPIC_API_KEY: el bot responderá derivando, sin modelo.');
  const servicio = await crearServicio();
  const puerto = await servicio.escuchar();
  console.log(`Chatbot escuchando en ${process.env.HOST ?? '127.0.0.1'}:${puerto}`);
}
