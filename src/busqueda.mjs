// Búsqueda de trozos relevantes con FTS5 (BM25). Sin vectores: para webs pequeñas basta y se puede auditar.
// La consulta se construye aquí con palabras sueltas entre comillas, así el usuario no puede inyectar sintaxis FTS.

const VACIAS = new Set(`a al algo algun alguna alguno algunos ante antes aqui asi aun bien cada como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era eres es esa ese eso esta estas este esto estos fue ha hay hola gracias la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otro para pero poco por porque puede pueden puedo que quien quiero quisiera saber se segun ser si sin sobre son su sus tambien tan te teneis tengo ti tiene tienen todo todos tu tus un una uno unos usted ustedes vosotros y ya yo buenas buenos dias tardes noches favor me podeis podrias decir informacion hacer haceis cuanto cuanta cuantos cuantas`.split(/\s+/));

const normalizar = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Sinónimos generales de atención al público: la gente pregunta con unas palabras y la web usa otras
// («¿dónde estáis?» → domicilio, «chatbot» → agente). Solo palabras de uso común, nada de un negocio concreto.
const SINONIMOS = {
  donde: ['direccion', 'domicilio', 'calle', 'ubicacion'],
  ubicacion: ['direccion', 'domicilio', 'calle'], ubicados: ['direccion', 'domicilio', 'calle'], direccion: ['domicilio', 'calle'],
  chatbot: ['agente', 'asistente'], chatbots: ['agentes', 'asistente'], bot: ['agente', 'asistente'], bots: ['agentes', 'asistente'],
  cif: ['nif'], nif: ['cif'],
  contactar: ['contacto', 'correo', 'telefono'], contacto: ['correo', 'telefono'], llamar: ['telefono'], email: ['correo'],
  precio: ['precios', 'tarifa', 'cuesta'], precios: ['tarifa', 'cuesta'], cuesta: ['precio', 'tarifa'], cuestan: ['precio', 'tarifa'],
  horario: ['horas', 'abierto'], abris: ['horario'], abierto: ['horario'],
};

// «¿Cuánto cuestan las instalaciones?» → "cuestan"* OR "instalacion"*  (raíces cortas con prefijo)
export function construirConsulta(texto) {
  const terminos = new Set();
  const extra = [];
  const anadir = (p) => terminos.add(`"${p.length > 5 ? p.slice(0, Math.max(5, p.length - 2)) : p}"*`);
  for (const p of normalizar(texto).split(/[^a-z0-9ñ]+/)) {
    if (SINONIMOS[p]) extra.push(...SINONIMOS[p]);
    if (!p || VACIAS.has(p) || (p.length < 3 && !/^\d+$/.test(p))) continue;
    anadir(p);
  }
  // Primero las palabras del usuario; los sinónimos completan hasta el tope.
  for (const p of extra) anadir(p);
  return [...terminos].slice(0, 12).join(' OR ');
}

// Devuelve los trozos útiles; si no hay ninguno, el bot sabe que no tiene información (regla 1).
export function buscarTrozos(negocioDb, pregunta, { anterior = null, limite = 6, corte = 0.3 } = {}) {
  let trozos = negocioDb.buscar(construirConsulta(pregunta), limite);
  // Preguntas de seguimiento («¿y cuánto cuesta?»): se añade el mensaje anterior del usuario.
  if (anterior && trozos.length < limite) {
    const ids = new Set(trozos.map((t) => t.id));
    trozos = [...trozos, ...negocioDb.buscar(construirConsulta(`${anterior} ${pregunta}`), limite).filter((t) => !ids.has(t.id))].slice(0, limite);
  }
  if (!trozos.length) return [];
  // bm25 da números negativos: cuanto más negativo, mejor. Se quitan los que quedan muy lejos del mejor.
  const mejor = Math.min(...trozos.map((t) => t.puntos));
  return trozos.filter((t) => t.puntos <= mejor * corte);
}
