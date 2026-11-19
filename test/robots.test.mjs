import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearRobots, evaluar } from '../src/carga/robots.mjs';

const robots = parsearRobots(`
User-agent: Applebot
Allow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Google
Disallow: /privado

User-agent: *
Allow: /
`);

const casos = [
  ['Applebot', '/', true],
  ['Applebot-Extended', '/', false],
  ['Googlebot', '/', true],
  ['Googlebot', '/privado', false],
  ['OtroBot', '/', true],
];

for (const [ua, ruta, esperado] of casos) {
  test(`${ua} ${ruta} → ${esperado ? 'permitido' : 'bloqueado'}`, () => {
    assert.equal(evaluar(robots, ua, ruta).permitido, esperado);
  });
}

test('Googlebot /privado cae en el grupo Google', () => {
  assert.deepEqual(evaluar(robots, 'Googlebot', '/privado').grupo.agentes, ['google']);
});

test('OtroBot cae en el comodín *', () => {
  assert.deepEqual(evaluar(robots, 'OtroBot', '/').grupo.agentes, ['*']);
});

test('a igual longitud gana Allow, y la regla más larga manda', () => {
  const r = parsearRobots('User-agent: *\nDisallow: /blog\nAllow: /blog/publico\nDisallow: /x\nAllow: /x');
  assert.equal(evaluar(r, 'Bot', '/blog/publico/1').permitido, true);
  assert.equal(evaluar(r, 'Bot', '/blog/privado').permitido, false);
  assert.equal(evaluar(r, 'Bot', '/x').permitido, true);
});

test('comodines * y $', () => {
  const r = parsearRobots('User-agent: *\nDisallow: /*.pdf$');
  assert.equal(evaluar(r, 'Bot', '/doc.pdf').permitido, false);
  assert.equal(evaluar(r, 'Bot', '/doc.pdf?x=1').permitido, true);
});
