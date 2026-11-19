// Rastreo educado de la web de un negocio: robots.txt (RFC 9309) y Crawl-delay respetados, una petición por
// segundo como mínimo, user agent honesto, mismo origen y tope de páginas. Sin JavaScript (fetch en crudo).
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parsearRobots, evaluar } from './robots.mjs';

export const UA = 'IAPro-Chatbot/0.1 (+https://iapro.top; asistente del propio negocio)';
const MAX_BYTES = 3 * 1024 * 1024;
const NO_HTML = /\.(pdf|jpe?g|png|webp|gif|svg|ico|zip|rar|mp3|mp4|mov|webm|css|js|json|xml|txt|docx?|xlsx?)$/i;
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

function ipPrivada(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return ipPrivada(v6.slice(7));
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

// El servidor no debe rastrear su propia red: el dominio tiene que resolver solo a IPs públicas (de auditor-aeo).
export async function esDestinoPublico(host, resolver = (h) => lookup(h, { all: true })) {
  try {
    const direcciones = await resolver(host);
    return direcciones.length > 0 && direcciones.every((d) => !ipPrivada(d.address));
  } catch {
    return false;
  }
}

async function leer(pedir, url) {
  try {
    const res = await pedir(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const tipo = res.headers.get('content-type') ?? '';
    const largo = Number(res.headers.get('content-length') ?? 0);
    if (largo > MAX_BYTES) return { estado: res.status, urlFinal: res.url || url, tipo, error: 'demasiado grande' };
    const texto = await res.text();
    return { estado: res.status, urlFinal: res.url || url, tipo, texto: texto.slice(0, MAX_BYTES) };
  } catch (e) {
    return { estado: 0, urlFinal: url, error: e.cause?.code ?? e.message };
  }
}

const enlacesDe = (html, base) => [...html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)/gi)]
  .map((m) => { try { const u = new URL(m[1].trim(), base); u.hash = ''; return u.href; } catch { return null; } })
  .filter(Boolean);

const locsDe = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));

export async function rastrear(urlInicio, {
  max = 40, pedir = fetch, esperar = espera, comprobarDestino = esDestinoPublico, registrar = () => {},
} = {}) {
  const inicio = new URL(urlInicio);
  if (!(await comprobarDestino(inicio.hostname))) throw new Error(`${inicio.hostname} no resuelve a una dirección pública`);

  const robotsRes = await leer(pedir, new URL('/robots.txt', inicio).href);
  const robots = parsearRobots(robotsRes.estado === 200 && !/html/i.test(robotsRes.tipo) ? robotsRes.texto : '');
  const retraso = Math.max(1000, (evaluar(robots, UA).grupo?.crawlDelay ?? 0) * 1000);
  const permitido = (u) => evaluar(robots, UA, u.pathname + u.search).permitido;
  let peticiones = 1;
  const pedirEducado = async (url) => { await esperar(retraso); peticiones++; return leer(pedir, url); };

  // Sitemaps: los de robots.txt o /sitemap.xml; un nivel de índice como mucho.
  const cola = [inicio.href];
  for (const s of (robots.sitemaps.length ? robots.sitemaps : ['/sitemap.xml']).slice(0, 2)) {
    const r = await pedirEducado(new URL(s, inicio).href);
    if (r.estado !== 200 || !r.texto) continue;
    const locs = locsDe(r.texto);
    if (/<sitemapindex/i.test(r.texto)) {
      for (const hijo of locs.slice(0, 3)) {
        const h = await pedirEducado(hijo);
        if (h.estado === 200 && h.texto) cola.push(...locsDe(h.texto));
      }
    } else cola.push(...locs);
  }

  const vistas = new Set();
  const paginas = [];
  const descartadas = [];
  while (cola.length && paginas.length < max) {
    let u;
    try { u = new URL(cola.shift()); } catch { continue; }
    u.hash = '';
    if (u.origin !== inicio.origin || vistas.has(u.href) || NO_HTML.test(u.pathname)) continue;
    vistas.add(u.href);
    if (!permitido(u)) { descartadas.push({ url: u.href, motivo: 'robots.txt' }); continue; }
    registrar(`rastreando ${u.href}`);
    const r = await pedirEducado(u.href);
    const final = new URL(r.urlFinal);
    if (final.origin !== inicio.origin) { descartadas.push({ url: u.href, motivo: 'redirige fuera' }); continue; }
    if (r.estado !== 200 || !/html/i.test(r.tipo ?? '') || !r.texto) {
      descartadas.push({ url: u.href, motivo: r.error ?? `estado ${r.estado}` });
      continue;
    }
    vistas.add(final.href);
    paginas.push({ url: final.href, html: r.texto });
    for (const e of enlacesDe(r.texto, final.href)) if (!vistas.has(e)) cola.push(e);
  }
  return { inicio: inicio.href, retrasoMs: retraso, peticiones, paginas, descartadas };
}
