#!/usr/bin/env node
// Servicio HTTP del chatbot (mismo estilo que auditor-aeo/src/servicio/servidor.mjs, sin framework).
//   GET  /salud   → estado
//   POST /chat    → { negocio_id, conversacion_id?, mensaje } → { conversacion_id, respuesta }
// CORS: un navegador solo puede llamar desde los dominios de la ficha del negocio. Sin cabecera Origin (curl,
// pruebas en el servidor) se acepta; los límites por negocio y el tope de gasto protegen igual.
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarNegocios } from './negocios.mjs';
import { abrirAlmacen } from './almacen.mjs';
import { crearAsistente } from './asistente.mjs';

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

  const responder = (res, codigo, cuerpo, cabeceras = {}) => res
    .writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabeceras })
    .end(JSON.stringify(cuerpo));

  const servidor = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && pathname === '/salud') return responder(res, 200, { ok: true, negocios: negocios.size, modelo: asistente.activo });
      if (pathname !== '/chat') return responder(res, 404, { error: 'no encontrado' });

      const origen = req.headers.origin ?? null;
      const cors = origen ? { 'access-control-allow-origin': origen, vary: 'Origin' } : {};
      if (req.method === 'OPTIONS') {
        // El preflight aún no sabe el negocio: se acepta cualquier origen de alguna ficha, y el POST lo concreta.
        const conocido = origen && [...negocios.values()].some((f) => f.dominios.includes(origen));
        if (!conocido) return res.writeHead(403).end();
        return res.writeHead(204, { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' }).end();
      }
      if (req.method !== 'POST') return responder(res, 405, { error: 'método no permitido' });

      const cuerpo = await leerJson(req);
      const ficha = negocios.get(cuerpo.negocio_id);
      if (!ficha) return responder(res, 404, { error: 'negocio no encontrado' });
      if (origen && !ficha.dominios.includes(origen)) return responder(res, 403, { error: 'dominio no autorizado' });
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
