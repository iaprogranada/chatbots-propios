// El widget y lo que lo rodea: archivos públicos, configuración sin datos internos, página de prueba y CORS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicio, configWidget, colorTexto } from '../src/servidor.mjs';
import { abrirAlmacen } from '../src/almacen.mjs';
import { normalizarFicha, validarFicha, cargarNegocios } from '../src/negocios.mjs';

const ficha = normalizarFicha({
  id: 'bar', nombre: 'Bar Pepe', tono: 'cercano', derivacion: { email: 'hola@barpepe.example' },
  instrucciones: 'Secreto interno', dominios: ['https://barpepe.example'], urls: ['https://barpepe.example/'],
  widget: { color: '#FF8C00', botones: ['Carta'] },
});

async function montar(env = {}) {
  const pedir = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hola.' }], stop_reason: 'end_turn', usage: {} }), { status: 200 });
  const servicio = await crearServicio({ env: { TOPE_GASTO_DIARIO: '2', ...env }, negocios: new Map([['bar', ficha]]), almacen: abrirAlmacen(), pedir, registrar: () => {} });
  const puerto = await servicio.escuchar(0);
  return { servicio, url: (p) => `http://127.0.0.1:${puerto}${p}` };
}

test('sirve widget.js y las imágenes, y nada fuera de publico/', async (t) => {
  const { servicio, url } = await montar();
  t.after(() => servicio.cerrar());
  const js = await fetch(url('/widget.js'));
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(await js.text(), /attachShadow/);
  const png = await fetch(url('/publico/avatar-cabeza.png'));
  assert.equal(png.status, 200);
  assert.equal(png.headers.get('content-type'), 'image/png');
  for (const malo of ['/publico/../.env', '/publico/..%2F.env', '/publico/widget.mjs', '/publico/.env']) {
    assert.equal((await fetch(url(malo))).status, 404, malo);
  }
});

test('la configuración solo lleva datos públicos', async (t) => {
  const { servicio, url } = await montar();
  t.after(() => servicio.cerrar());
  const r = await fetch(url('/widget/config?negocio=bar'));
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const c = await r.json();
  assert.equal(c.color, '#FF8C00');
  assert.deepEqual(c.botones, ['Carta']);
  assert.match(c.textoError, /hola@barpepe\.example/);
  const crudo = JSON.stringify(c);
  for (const interno of ['Secreto interno', 'barpepe.example/', 'mensajesPorDia', 'dominios']) assert.ok(!crudo.includes(interno), interno);
  assert.equal((await fetch(url('/widget/config?negocio=otro'))).status, 404);
});

test('página de prueba, y el chat acepta llamadas desde la dirección del propio servicio', async (t) => {
  const { servicio, url } = await montar({ URL_PUBLICA: 'https://chat.example' });
  t.after(() => servicio.cerrar());
  const html = await (await fetch(url('/prueba/bar'))).text();
  assert.match(html, /data-negocio="bar"/);
  assert.match(html, /noindex/);
  const chat = (origin) => fetch(url('/chat'), { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ negocio_id: 'bar', mensaje: 'hola' }) });
  assert.equal((await chat('https://chat.example')).status, 200);
  assert.equal((await chat('https://otra.example')).status, 403);
});

test('texto legible sobre el color de acento y ficha del widget validada', async () => {
  assert.equal(colorTexto('#FF8C00'), '#1a0d00');
  assert.equal(colorTexto('#0B1A2E'), '#FFFFFF');
  assert.equal(configWidget(normalizarFicha({ ...ficha, widget: { color: 'rojo' } })).color, '#14A8FF');
  const errores = validarFicha({ ...ficha, widget: { color: 'rojo', avatarBusto: '../x.png', botones: [''] } }, 'bar');
  assert.equal(errores.filter((e) => e.startsWith('widget.')).length, 3);
  const iapro = (await cargarNegocios()).get('iapro');
  assert.equal(configWidget(iapro).etiqueta, 'RECEPCIÓN · IA PRO');
});
