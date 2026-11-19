// Regla 2: datos sensibles. Se enmascaran ANTES de guardar el mensaje y antes de enviarlo al modelo,
// así nunca quedan en claro en la base, en los registros ni en la API.
// Mejor tapar de más que de menos: un número con forma de DNI se tapa aunque su letra no cuadre.

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

function luhn(digitos) {
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos.at(-1 - i));
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    suma += d;
  }
  return suma % 10 === 0;
}

function ibanValido(texto) {
  const iban = texto.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const reordenado = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
  let resto = 0;
  for (const c of reordenado) resto = (resto * 10 + Number(c)) % 97;
  return resto === 1;
}

export function dniValido(texto) {
  const t = texto.replace(/[\s-]/g, '').toUpperCase();
  const m = /^([XYZ]?)(\d{7,8})([A-Z])$/.exec(t);
  if (!m) return false;
  const numero = Number(({ X: '0', Y: '1', Z: '2' }[m[1]] ?? '') + m[2]);
  return LETRAS_DNI[numero % 23] === m[3];
}

const SALUD = /\b(padezco|sufro|me (han )?diagnosticad[oa]|tengo|estoy)\s+(de\s+)?(c[aá]ncer|vih|sida|diabetes|depresi[oó]n|ansiedad|epilepsia|esquizofrenia|trastorno [a-záéíóúñ]+|embarazada|hepatitis|bipolar|tumor)\b/gi;

// Cada detector: tipo, expresión y, si hace falta, una comprobación extra sobre lo encontrado.
const DETECTORES = [
  // IBAN español con o sin espacios, y cualquier IBAN extranjero que pase el dígito de control.
  { tipo: 'iban', re: /\bES\d{2}(?:[\s-]?\d{4}){5}\b/gi },
  { tipo: 'iban', re: /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){2,7}(?:[\s-]?[A-Z0-9]{1,3})?\b/g, valida: ibanValido },
  { tipo: 'tarjeta', re: /\b\d(?:[\s-]?\d){12,18}\b/g, valida: (t) => luhn(t.replace(/\D/g, '')) },
  { tipo: 'dni', re: /\b[XYZ][\s-]?\d{7}[\s-]?[A-Z]\b/gi },
  { tipo: 'dni', re: /\b\d{8}[\s-]?[A-Z]\b/gi },
  // «mi contraseña es X», «password: X», «el pin 1234»
  { tipo: 'contraseña', re: /\b(contrase[nñ]a|password|clave de acceso|pin)\b(\s+(es|era))?\s*[:=]?\s*\S+/gi },
  { tipo: 'salud', re: SALUD },
];

const ETIQUETAS = { iban: '[IBAN oculto]', tarjeta: '[tarjeta oculta]', dni: '[DNI oculto]', contraseña: '[contraseña oculta]', salud: '[dato de salud oculto]' };

export function enmascarar(texto) {
  let resultado = String(texto ?? '');
  const tipos = new Set();
  for (const { tipo, re, valida } of DETECTORES) {
    resultado = resultado.replace(re, (encontrado) => {
      if (encontrado.startsWith('[')) return encontrado;
      if (valida && !valida(encontrado)) return encontrado;
      tipos.add(tipo);
      return ETIQUETAS[tipo];
    });
  }
  return { texto: resultado, tipos: [...tipos] };
}

export function avisoSensibles(tono) {
  return tono === 'formal'
    ? 'Por su seguridad, no envíe por este chat datos personales como DNI, cuentas bancarias, contraseñas o información de salud. No los he guardado.'
    : 'Por tu seguridad, no envíes por aquí datos personales como el DNI, cuentas bancarias, contraseñas o información de salud. No los he guardado.';
}
