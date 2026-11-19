import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rastrear, esDestinoPublico, UA } from '../src/carga/rastrear.mjs';

// Web falsa en memoria: así el test no sale a internet.
function webFalsa(rutas) {
  const pedidas = [];
  const pedir = async (url, opciones) => {
    pedidas.push({ url, ua: opciones.headers['user-agent'] });
    const u = new URL(url);
    const r = rutas[u.pathname];
    if (!r) return new Response('no', { status: 404, headers: { 'content-type': 'text/html' } });
    const [tipo, cuerpo] = typeof r === 'string' ? ['text/html; charset=utf-8', r] : r;
    return new Response(cuerpo, { status: 200, headers: { 'content-type': tipo } });
  };
  return { pedir, pedidas };
}

const web = {
  '/robots.txt': ['text/plain', 'User-agent: *\nDisallow: /privado\nCrawl-delay: 2\nSitemap: https://tienda.example/sitemap.xml'],
  '/sitemap.xml': ['application/xml', '<urlset><url><loc>https://tienda.example/precios</loc></url></urlset>'],
  '/': '<a href="/servicios">Servicios</a> <a href="/privado/admin">x</a> <a href="https://otra.example/">fuera</a> <a href="/catalogo.pdf">pdf</a>',
  '/servicios': '<h1>Servicios</h1><a href="/">inicio</a><a href="/contacto#form">c</a>',
  '/precios': '<h1>Precios</h1>',
  '/contacto': '<h1>Contacto</h1>',
};

const opciones = (pedir, esperas) => ({ pedir, esperar: async (ms) => esperas.push(ms), comprobarDestino: async () => true });

test('respeta robots.txt, Crawl-delay, mismo origen y tipos de archivo', async () => {
  const { pedir, pedidas } = webFalsa(web);
  const esperas = [];
  const r = await rastrear('https://tienda.example/', opciones(pedir, esperas));
  const urls = r.paginas.map((p) => new URL(p.url).pathname).sort();
  assert.deepEqual(urls, ['/', '/contacto', '/precios', '/servicios']);
  assert.ok(r.descartadas.some((d) => d.url.includes('/privado') && d.motivo === 'robots.txt'));
  assert.ok(!pedidas.some((p) => p.url.includes('otra.example') || p.url.includes('/privado') || p.url.endsWith('.pdf')));
  assert.ok(esperas.every((ms) => ms === 2000), 'Crawl-delay de 2 s');
  assert.equal(esperas.length, pedidas.length - 1, 'espera antes de cada petición salvo robots.txt');
  assert.ok(pedidas.every((p) => p.ua === UA));
});

test('nunca baja de una petición por segundo y para en el tope', async () => {
  const { pedir } = webFalsa({ ...web, '/robots.txt': ['text/plain', ''] });
  const esperas = [];
  const r = await rastrear('https://tienda.example/', { ...opciones(pedir, esperas), max: 2 });
  assert.equal(r.paginas.length, 2);
  assert.ok(esperas.every((ms) => ms >= 1000));
});

test('no rastrea direcciones privadas', async () => {
  assert.equal(await esDestinoPublico('x', async () => [{ address: '127.0.0.1' }]), false);
  assert.equal(await esDestinoPublico('x', async () => [{ address: '192.168.1.10' }]), false);
  assert.equal(await esDestinoPublico('x', async () => [{ address: '93.184.216.34' }]), true);
  const { pedir } = webFalsa(web);
  await assert.rejects(rastrear('https://tienda.example/', { pedir, comprobarDestino: async () => false }), /pública/);
});
