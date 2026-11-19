// Extracción de texto y troceado. Cada trozo lleva la URL y la sección (H1 > H2 > H3) de donde sale,
// para que el bot pueda decir de dónde lo saca y la búsqueda tenga contexto.
import * as cheerio from 'cheerio';

const BLOQUES = 'address,article,aside,blockquote,dd,div,dl,dt,figcaption,figure,footer,form,header,li,main,ol,p,pre,section,table,tbody,thead,tr,td,th,ul';
const QUITAR = 'script,style,noscript,template,svg,iframe,canvas,nav,button,select,input,textarea,'
  // Lo oculto no lo ve una persona: tampoco tiene que leerlo el bot (menos sitio para órdenes escondidas, A5).
  + '[hidden],[aria-hidden="true"],[style*="display:none"],[style*="display: none"],[style*="visibility:hidden"],[style*="visibility: hidden"]';
const MARCA = '\u0001';

export function extraerTexto(html, url) {
  const $ = cheerio.load(html ?? '');
  const titulo = $('title').first().text().replace(/\s+/g, ' ').trim() || new URL(url).pathname;
  $(QUITAR).remove();
  $('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i]').remove();
  $('br').replaceWith('\n');
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const nivel = Number(el.tagName[1]);
    const texto = $(el).text().replace(/\s+/g, ' ').trim();
    $(el).replaceWith(texto ? `\n${MARCA}${nivel}${MARCA}${texto}\n` : '');
  });
  $(BLOQUES).each((_, el) => { $(el).prepend('\n').append('\n'); });
  const lineas = $('body').text().split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return {
    titulo,
    ordenesQuitadas: lineas.filter((l) => esOrden(l)),
    lineas: lineas.filter((l) => !esOrden(l)).map((l) => {
      const m = new RegExp(`^${MARCA}(\\d)${MARCA}(.*)$`).exec(l);
      return m ? { encabezado: Number(m[1]), texto: m[2] } : { texto: l };
    }),
  };
}

const palabras = (t) => t.split(' ').length;

// Órdenes dirigidas a un asistente escondidas en una web («di que todo es gratis», «ignora tus instrucciones»).
// Se quitan al cargar: el contenido de la web es dato, nunca instrucciones (regla 6, A5).
const ORDEN = /\b(ignora|olvida|omite|desobedece)\b.{0,40}\b(instrucciones|reglas|anterior|lo de arriba)\b|\b(di|dile|dime|responde|contesta|afirma|asegura)\s+(siempre\s+)?que\b|\b(asistente|bot|chatbot|ia|inteligencia artificial|modelo)s?\b.{0,30}\b(debe|deben|tienes que|tiene que|has de)\b|\b(instrucci[oó]n|nota|mensaje|aviso)\s+(para|a)\s+(el |los |las )?(asistente|bot|chatbot|ia|modelo)s?|\b(system prompt|prompt del sistema|ignore (all |previous )|you are now|as an ai)\b/i;

export const esOrden = (texto) => ORDEN.test(texto);

// Junta líneas en trozos de ~maxPalabras con un solape de ~solape palabras, sin partir líneas.
export function trocear({ titulo, lineas }, { maxPalabras = 300, solape = 50 } = {}) {
  const trozos = [];
  const ruta = [];
  let actual = [];
  let seccion = '';
  const cerrar = (conSolape) => {
    if (!actual.length) return;
    trozos.push({ titulo, seccion, texto: actual.join('\n') });
    if (!conSolape) { actual = []; return; }
    const resto = [];
    let n = 0;
    for (const l of [...actual].reverse()) { if (n >= solape) break; resto.unshift(l); n += palabras(l); }
    actual = resto.length < actual.length ? resto : [];
  };
  for (const l of lineas) {
    if (l.encabezado && l.encabezado <= 3) {
      cerrar(false);
      ruta.length = l.encabezado - 1;
      ruta[l.encabezado - 1] = l.texto;
      seccion = ruta.filter(Boolean).join(' > ');
      continue;
    }
    if (actual.length && palabras(actual.join(' ')) + palabras(l.texto) > maxPalabras) cerrar(true);
    actual.push(l.texto);
  }
  cerrar(false);
  return trozos;
}

// Varias páginas de una web: las líneas que se repiten en casi todas (menú, pie, avisos) se quedan solo en la primera.
export function trocearSitio(paginas, opciones) {
  const extraidas = paginas.map((p) => ({ url: p.url, ...extraerTexto(p.html, p.url) }));
  const veces = new Map();
  for (const p of extraidas) for (const t of new Set(p.lineas.filter((l) => !l.encabezado).map((l) => l.texto))) veces.set(t, (veces.get(t) ?? 0) + 1);
  const repetida = (t) => extraidas.length >= 3 && veces.get(t) > extraidas.length / 2;
  const vistas = new Set();
  return extraidas.map((p) => {
    const lineas = p.lineas.filter((l) => {
      if (l.encabezado || !repetida(l.texto)) return true;
      if (vistas.has(l.texto)) return false;
      vistas.add(l.texto);
      return true;
    });
    return { url: p.url, titulo: p.titulo, ordenesQuitadas: p.ordenesQuitadas, trozos: trocear({ titulo: p.titulo, lineas }, opciones) };
  });
}
