// A8: ninguna clave en el repositorio. Recorre los archivos que git sigue (o seguiría) y busca patrones de claves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATRONES = [
  /sk-ant-[a-z0-9]{2,}-[A-Za-z0-9_-]{20,}/, // Anthropic
  /\bsk-[A-Za-z0-9]{32,}/, // OpenAI y similares
  /\bgh[pousr]_[A-Za-z0-9]{30,}/, // GitHub
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS
];

test('ningún archivo del repositorio contiene una clave', () => {
  const archivos = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const con = [];
  for (const a of archivos) {
    let texto;
    try { texto = readFileSync(a, 'utf8'); } catch { continue; }
    if (PATRONES.some((p) => p.test(texto))) con.push(a);
  }
  assert.deepEqual(con, []);
});

test('el .env está ignorado por git', () => {
  const ignorado = execFileSync('git', ['check-ignore', '.env'], { encoding: 'utf8' }).trim();
  assert.equal(ignorado, '.env');
});
