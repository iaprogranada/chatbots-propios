// Copiado tal cual de auditor-aeo/src/robots.mjs (probado con sus 5 casos).
// Parseo y emparejado de robots.txt según RFC 9309.

export function parsearRobots(texto = '') {
  const grupos = [];
  const sitemaps = [];
  let actual = null;
  let leyendoAgentes = false;

  for (const bruta of texto.split(/\r?\n/)) {
    const linea = bruta.replace(/#.*$/, '').trim();
    if (!linea) continue;
    const dosPuntos = linea.indexOf(':');
    if (dosPuntos === -1) continue;
    const clave = linea.slice(0, dosPuntos).trim().toLowerCase();
    const valor = linea.slice(dosPuntos + 1).trim();

    if (clave === 'user-agent') {
      // Varias líneas User-agent seguidas comparten el mismo grupo.
      if (!leyendoAgentes) {
        actual = { agentes: [], nombres: [], reglas: [], crawlDelay: null };
        grupos.push(actual);
        leyendoAgentes = true;
      }
      actual.agentes.push(valor.toLowerCase());
      actual.nombres.push(valor);
    } else if (clave === 'allow' || clave === 'disallow') {
      leyendoAgentes = false;
      if (!actual) continue;
      actual.reglas.push({ tipo: clave, ruta: valor });
    } else if (clave === 'crawl-delay') {
      leyendoAgentes = false;
      if (actual) actual.crawlDelay = Number(valor) || null;
    } else if (clave === 'sitemap') {
      sitemaps.push(valor);
    } else {
      leyendoAgentes = false;
    }
  }
  return { grupos, sitemaps };
}

// Gana el grupo cuyo nombre coincide de forma más específica; `*` es el comodín final.
// El prefijo va en una sola dirección: el nombre del grupo puede ser prefijo del
// crawler (`Google` captura a `Googlebot`), nunca al revés (`Applebot-Extended`
// no captura a `Applebot`).
export function grupoPara(analisis, ua) {
  const objetivo = ua.toLowerCase();
  let mejorLargo = -1;
  let elegidos = [];

  for (const grupo of analisis.grupos) {
    for (const agente of grupo.agentes) {
      if (agente === '*') continue;
      if (objetivo === agente || objetivo.startsWith(agente)) {
        if (agente.length > mejorLargo) {
          mejorLargo = agente.length;
          elegidos = [grupo];
        } else if (agente.length === mejorLargo && !elegidos.includes(grupo)) {
          elegidos.push(grupo);
        }
      }
    }
  }
  if (!elegidos.length) elegidos = analisis.grupos.filter((g) => g.agentes.includes('*'));
  if (!elegidos.length) return null;

  // Grupos repetidos para el mismo agente se fusionan (RFC 9309 §2.2.1).
  return {
    agentes: [...new Set(elegidos.flatMap((g) => g.agentes))],
    nombres: [...new Set(elegidos.flatMap((g) => g.nombres))],
    reglas: elegidos.flatMap((g) => g.reglas),
    crawlDelay: elegidos.find((g) => g.crawlDelay != null)?.crawlDelay ?? null,
  };
}

function patronARegex(ruta) {
  const fin = ruta.endsWith('$');
  const cuerpo = fin ? ruta.slice(0, -1) : ruta;
  const escapado = cuerpo.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escapado + (fin ? '$' : ''));
}

// Devuelve { permitido, regla, grupo }. Gana la regla más larga; a igual longitud, Allow.
export function evaluar(analisis, ua, ruta = '/') {
  const grupo = grupoPara(analisis, ua);
  if (!grupo) return { permitido: true, regla: null, grupo: null };

  let mejor = null;
  for (const regla of grupo.reglas) {
    if (regla.ruta === '') continue; // `Disallow:` vacío no bloquea nada
    if (!patronARegex(regla.ruta).test(ruta)) continue;
    const largo = regla.ruta.length;
    if (!mejor || largo > mejor.ruta.length || (largo === mejor.ruta.length && regla.tipo === 'allow')) {
      mejor = regla;
    }
  }
  return { permitido: !mejor || mejor.tipo === 'allow', regla: mejor, grupo };
}
