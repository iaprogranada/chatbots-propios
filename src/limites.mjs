// Regla 8: límites por negocio y tope global de gasto. Se comprueban ANTES de llamar al modelo:
// si se supera alguno, se responde un aviso fijo y no se gasta nada (A7).
import { textoDerivacion } from './negocios.mjs';

export function comprobarLimites({ ficha, mensaje, conversacion, usoHoy, gastoDia = 0, topeGasto = Infinity }) {
  const l = ficha.limites;
  const formal = ficha.tono === 'formal';
  const derivar = textoDerivacion(ficha);
  const no = (motivo, respuesta) => ({ ok: false, motivo, respuesta });

  if (!String(mensaje ?? '').trim()) return no('mensaje-vacio', formal ? 'No he recibido ningún mensaje. ¿En qué puedo ayudarle?' : 'No me ha llegado ningún mensaje. ¿En qué te ayudo?');
  if (mensaje.length > l.caracteresPorMensaje) {
    return no('mensaje-largo', formal
      ? `Su mensaje es demasiado largo (máximo ${l.caracteresPorMensaje} caracteres). ¿Puede resumirlo?`
      : `Tu mensaje es demasiado largo (máximo ${l.caracteresPorMensaje} caracteres). ¿Puedes resumirlo?`);
  }
  if (conversacion && conversacion.mensajes >= l.mensajesPorConversacion) {
    return no('tope-conversacion', formal
      ? `Hemos llegado al máximo de mensajes de esta conversación. ${derivar}`
      : `Hemos llegado al máximo de mensajes de esta conversación. ${derivar}`);
  }
  if (usoHoy.mensajes >= l.mensajesPorDia || gastoDia >= topeGasto) {
    return no(usoHoy.mensajes >= l.mensajesPorDia ? 'tope-dia' : 'tope-gasto', formal
      ? `Ahora mismo no puedo atenderle por este chat. ${derivar}`
      : `Ahora mismo no puedo atenderte por este chat. ${derivar}`);
  }
  return { ok: true };
}
