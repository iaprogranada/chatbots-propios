// Fichas de alta de cada negocio (negocios/<id>.json). La ficha es la fuente de verdad: se lee al arrancar.
// Validar aquí evita que un error de configuración llegue al bot (p. ej. un negocio sin canal de derivación).
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TONOS = ['formal', 'cercano'];
const LIMITES = { mensajesPorConversacion: 20, mensajesPorDia: 300, caracteresPorMensaje: 1000 };

export function validarFicha(ficha, idEsperado) {
  const errores = [];
  const f = ficha ?? {};
  if (!ID.test(String(f.id))) errores.push('id: solo minúsculas, números y guiones (2 a 40)');
  if (idEsperado && f.id !== idEsperado) errores.push(`id: tiene que coincidir con el nombre del archivo (${idEsperado})`);
  if (typeof f.nombre !== 'string' || !f.nombre.trim()) errores.push('nombre: obligatorio');
  if (!TONOS.includes(f.tono)) errores.push(`tono: ${TONOS.join(' o ')}`);
  if (f.instrucciones != null && typeof f.instrucciones !== 'string') errores.push('instrucciones: texto');

  const d = f.derivacion ?? {};
  const canales = ['telefono', 'email', 'web', 'whatsapp'].filter((c) => typeof d[c] === 'string' && d[c].trim());
  if (!canales.length) errores.push('derivacion: hace falta al menos un canal (telefono, email, web o whatsapp)');

  const h = f.horario;
  if (h != null) {
    if (typeof h.zona !== 'string') errores.push('horario.zona: p. ej. Europe/Madrid');
    for (const [dia, tramos] of Object.entries(h.dias ?? {})) {
      if (!DIAS.includes(dia)) errores.push(`horario.dias.${dia}: día no válido (sin tildes: ${DIAS.join(', ')})`);
      if (!Array.isArray(tramos) || tramos.some((t) => !Array.isArray(t) || t.length !== 2 || !HORA.test(t[0]) || !HORA.test(t[1]) || t[0] >= t[1])) {
        errores.push(`horario.dias.${dia}: tramos como [["09:00","14:00"]]`);
      }
    }
  }

  if (!Array.isArray(f.dominios) || f.dominios.some((o) => !/^https?:\/\/[^/]+$/.test(o))) {
    errores.push('dominios: lista de orígenes como "https://iapro.top" (sin barra final)');
  }
  for (const [clave, valor] of Object.entries(f.limites ?? {})) {
    if (!(clave in LIMITES)) errores.push(`limites.${clave}: no existe`);
    else if (!Number.isInteger(valor) || valor < 1) errores.push(`limites.${clave}: entero positivo`);
  }
  if (!Array.isArray(f.urls) || f.urls.some((u) => !/^https:\/\//.test(u))) errores.push('urls: lista de direcciones https');
  if (f.ocultar !== undefined && (!Array.isArray(f.ocultar) || f.ocultar.some((t) => typeof t !== 'string' || t.trim().length < 4))) errores.push('ocultar: lista de textos (4 caracteres o más)');
  if (f.excluir !== undefined && (!Array.isArray(f.excluir) || f.excluir.some((u) => !/^https:\/\//.test(u)))) errores.push('excluir: lista de prefijos de URL https');
  return errores;
}

// Completa los valores por defecto y deja la ficha lista para usar.
export function normalizarFicha(f) {
  return {
    instrucciones: '',
    horario: null,
    modelo: null,
    maxPaginas: 40,
    widget: {},
    ...f,
    limites: { ...LIMITES, ...(f.limites ?? {}) },
  };
}

export async function cargarNegocios(carpeta = new URL('../negocios/', import.meta.url)) {
  const negocios = new Map();
  for (const archivo of (await readdir(carpeta)).filter((a) => a.endsWith('.json')).sort()) {
    const id = archivo.slice(0, -5);
    const ficha = JSON.parse(await readFile(join(carpeta instanceof URL ? carpeta.pathname : carpeta, archivo), 'utf8'));
    const errores = validarFicha(ficha, id);
    if (errores.length) throw new Error(`negocios/${archivo}:\n- ${errores.join('\n- ')}`);
    negocios.set(id, normalizarFicha(ficha));
  }
  return negocios;
}

// Texto de derivación con los canales públicos de la ficha. Lo escribe el código, no el modelo.
export function textoDerivacion(ficha) {
  const d = ficha.derivacion;
  const canales = [
    d.telefono && `teléfono ${d.telefono}`,
    d.whatsapp && `WhatsApp ${d.whatsapp}`,
    d.email && `correo ${d.email}`,
    d.web && d.web,
  ].filter(Boolean);
  const lista = canales.length > 1 ? `${canales.slice(0, -1).join(', ')} o ${canales.at(-1)}` : canales[0];
  return ficha.tono === 'formal'
    ? `Puede contactar con una persona del equipo de ${ficha.nombre} en: ${lista}.`
    : `Puedes hablar con una persona del equipo de ${ficha.nombre} en: ${lista}.`;
}

// «ocultar» de la ficha: textos publicados en la web que el dueño no quiere que el bot repita (p. ej. la dirección).
// Se quitan al cargar y se vuelven a comprobar en la salida. Sin distinguir mayúsculas.
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function quitarOcultos(texto, ocultar = []) {
  let r = texto;
  for (const t of ocultar) r = r.replace(new RegExp(`${escapar(t)}[,.]?\\s*`, 'gi'), '');
  return r;
}
export const contieneOculto = (texto, ocultar = []) => ocultar.some((t) => texto.toLowerCase().includes(t.toLowerCase()));
