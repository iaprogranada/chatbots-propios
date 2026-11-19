// Regla 4: ¿está abierto ahora? Se calcula en la zona horaria del negocio y se pasa al modelo como dato.
import { DIAS } from './negocios.mjs';

const NOMBRES = { lunes: 'lunes', martes: 'martes', miercoles: 'miércoles', jueves: 'jueves', viernes: 'viernes', sabado: 'sábado', domingo: 'domingo' };

function enZona(fecha, zona) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha).map((p) => [p.type, p.value]));
  const dia = DIAS.at(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(partes.weekday));
  return { dia, hora: `${partes.hour}:${partes.minute}`, fecha: `${partes.year}-${partes.month}-${partes.day}` };
}

// Día natural en España, para los contadores diarios.
export const diaDe = (fecha = new Date(), zona = 'Europe/Madrid') => enZona(fecha, zona).fecha;

// true / false, o null si la ficha no tiene horario.
export function estaAbierto(horario, fecha = new Date()) {
  if (!horario?.dias) return null;
  const { dia, hora } = enZona(fecha, horario.zona ?? 'Europe/Madrid');
  return (horario.dias[dia] ?? []).some(([desde, hasta]) => hora >= desde && hora < hasta);
}

export function describirHorario(horario) {
  if (!horario?.dias) return 'Horario no indicado.';
  const lineas = DIAS.map((d) => {
    const tramos = horario.dias[d];
    return `${NOMBRES[d]}: ${tramos?.length ? tramos.map(([a, b]) => `${a} a ${b}`).join(' y ') : 'cerrado'}`;
  });
  return `${lineas.join('; ')} (hora de ${horario.zona ?? 'Europe/Madrid'}).`;
}

export function momento(horario, fecha = new Date()) {
  const { dia, hora } = enZona(fecha, horario?.zona ?? 'Europe/Madrid');
  return `${NOMBRES[dia]}, ${hora}`;
}
