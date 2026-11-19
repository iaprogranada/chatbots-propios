// Base de datos del chatbot en SQLite (node:sqlite, sin dependencias). Todo lleva negocio_id.
// Aislamiento: el resto del código solo ve almacen.negocio(id), que devuelve funciones atadas a ese negocio.
// Ninguna función de un negocio puede leer ni escribir filas de otro.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ID } from './negocios.mjs';

const ESQUEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS fuentes (
  id INTEGER PRIMARY KEY, negocio_id TEXT NOT NULL, url TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'web',
  titulo TEXT, fecha TEXT NOT NULL, hash TEXT, UNIQUE (negocio_id, url)
);
CREATE TABLE IF NOT EXISTS fragmentos (
  id INTEGER PRIMARY KEY, negocio_id TEXT NOT NULL, fuente_id INTEGER NOT NULL REFERENCES fuentes(id) ON DELETE CASCADE,
  url TEXT NOT NULL, titulo TEXT, seccion TEXT, texto TEXT NOT NULL, posicion INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fragmentos_negocio ON fragmentos (negocio_id);
CREATE VIRTUAL TABLE IF NOT EXISTS fragmentos_fts USING fts5 (
  titulo, seccion, texto, negocio_id UNINDEXED, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS conversaciones (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, origen TEXT, inicio TEXT NOT NULL, mensajes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mensajes (
  id INTEGER PRIMARY KEY, negocio_id TEXT NOT NULL, conversacion_id TEXT NOT NULL REFERENCES conversaciones(id),
  rol TEXT NOT NULL CHECK (rol IN ('usuario', 'asistente')), texto TEXT NOT NULL, motivo TEXT,
  tokens_entrada INTEGER, tokens_salida INTEGER, tokens_cache INTEGER, coste REAL, fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mensajes_conversacion ON mensajes (negocio_id, conversacion_id);
CREATE TABLE IF NOT EXISTS uso_diario (
  negocio_id TEXT NOT NULL, dia TEXT NOT NULL, mensajes INTEGER NOT NULL DEFAULT 0, llamadas INTEGER NOT NULL DEFAULT 0,
  tokens_entrada INTEGER NOT NULL DEFAULT 0, tokens_salida INTEGER NOT NULL DEFAULT 0, coste REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (negocio_id, dia)
);`;

export function abrirAlmacen(ruta = ':memory:') {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec(ESQUEMA);
  const q = (sql) => db.prepare(sql);
  const enTransaccion = (fn) => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  const sql = {
    fuente: q('SELECT id FROM fuentes WHERE negocio_id = ? AND url = ?'),
    borrarFts: q('DELETE FROM fragmentos_fts WHERE rowid IN (SELECT id FROM fragmentos WHERE negocio_id = ? AND fuente_id = ?)'),
    borrarFuente: q('DELETE FROM fuentes WHERE negocio_id = ? AND id = ?'),
    nuevaFuente: q('INSERT INTO fuentes (negocio_id, url, tipo, titulo, fecha, hash) VALUES (?, ?, ?, ?, ?, ?)'),
    nuevoFragmento: q('INSERT INTO fragmentos (negocio_id, fuente_id, url, titulo, seccion, texto, posicion) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    nuevoFts: q('INSERT INTO fragmentos_fts (rowid, titulo, seccion, texto, negocio_id) VALUES (?, ?, ?, ?, ?)'),
    fuentes: q('SELECT url, tipo, titulo, fecha, (SELECT count(*) FROM fragmentos f WHERE f.fuente_id = fuentes.id) AS fragmentos FROM fuentes WHERE negocio_id = ? ORDER BY url'),
    // La condición de negocio va en la tabla de fragmentos (la de verdad), no solo en el índice FTS.
    buscar: q(`SELECT f.id, f.url, f.titulo, f.seccion, f.texto, bm25(fragmentos_fts, 4.0, 2.0, 1.0) AS puntos
      FROM fragmentos_fts JOIN fragmentos f ON f.id = fragmentos_fts.rowid
      WHERE fragmentos_fts MATCH ? AND f.negocio_id = ? ORDER BY puntos LIMIT ?`),
    nuevaConversacion: q('INSERT INTO conversaciones (id, negocio_id, origen, inicio) VALUES (?, ?, ?, ?)'),
    conversacion: q('SELECT id, origen, inicio, mensajes FROM conversaciones WHERE id = ? AND negocio_id = ?'),
    sumarConversacion: q('UPDATE conversaciones SET mensajes = mensajes + 1 WHERE id = ? AND negocio_id = ?'),
    nuevoMensaje: q(`INSERT INTO mensajes (negocio_id, conversacion_id, rol, texto, motivo, tokens_entrada, tokens_salida, tokens_cache, coste, fecha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    historial: q('SELECT rol, texto, motivo, fecha FROM mensajes WHERE negocio_id = ? AND conversacion_id = ? ORDER BY id'),
    uso: q('SELECT mensajes, llamadas, tokens_entrada, tokens_salida, coste FROM uso_diario WHERE negocio_id = ? AND dia = ?'),
    sumarUso: q(`INSERT INTO uso_diario (negocio_id, dia, mensajes, llamadas, tokens_entrada, tokens_salida, coste) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (negocio_id, dia) DO UPDATE SET mensajes = mensajes + excluded.mensajes, llamadas = llamadas + excluded.llamadas,
      tokens_entrada = tokens_entrada + excluded.tokens_entrada, tokens_salida = tokens_salida + excluded.tokens_salida, coste = coste + excluded.coste`),
    gastoDia: q('SELECT coalesce(sum(coste), 0) AS coste FROM uso_diario WHERE dia = ?'),
  };

  function negocio(negocioId) {
    if (!ID.test(String(negocioId))) throw new Error(`negocio_id no válido: ${negocioId}`);
    const n = negocioId;
    return {
      id: n,
      // Sustituye todo lo cargado de una URL por sus trozos nuevos.
      guardarFuente({ url, tipo = 'web', titulo = null, hash = null, trozos }) {
        return enTransaccion(() => {
          const previa = sql.fuente.get(n, url);
          if (previa) { sql.borrarFts.run(n, previa.id); sql.borrarFuente.run(n, previa.id); }
          const { lastInsertRowid: fuenteId } = sql.nuevaFuente.run(n, url, tipo, titulo, new Date().toISOString(), hash);
          trozos.forEach((t, i) => {
            const { lastInsertRowid: id } = sql.nuevoFragmento.run(n, fuenteId, url, t.titulo ?? titulo, t.seccion ?? null, t.texto, i);
            sql.nuevoFts.run(id, t.titulo ?? titulo ?? '', t.seccion ?? '', t.texto, n);
          });
          return trozos.length;
        });
      },
      fuentes: () => sql.fuentes.all(n),
      // expresion = consulta FTS5 ya construida (ver busqueda.mjs).
      buscar: (expresion, limite = 6) => (expresion ? sql.buscar.all(expresion, n, limite) : []),
      nuevaConversacion(origen = null) {
        const id = randomUUID();
        sql.nuevaConversacion.run(id, n, origen, new Date().toISOString());
        return sql.conversacion.get(id, n);
      },
      // Devuelve null si la conversación no existe o es de otro negocio.
      conversacion: (id) => (typeof id === 'string' ? sql.conversacion.get(id, n) ?? null : null),
      historial: (conversacionId) => sql.historial.all(n, conversacionId),
      anotar({ conversacionId, rol, texto, motivo = null, tokensEntrada = null, tokensSalida = null, tokensCache = null, coste = null }) {
        if (!sql.conversacion.get(conversacionId, n)) throw new Error('conversación de otro negocio o inexistente');
        sql.nuevoMensaje.run(n, conversacionId, rol, texto, motivo, tokensEntrada, tokensSalida, tokensCache, coste, new Date().toISOString());
        if (rol === 'usuario') sql.sumarConversacion.run(conversacionId, n);
      },
      uso: (dia) => sql.uso.get(n, dia) ?? { mensajes: 0, llamadas: 0, tokens_entrada: 0, tokens_salida: 0, coste: 0 },
      sumarUso: (dia, { mensajes = 0, llamadas = 0, tokensEntrada = 0, tokensSalida = 0, coste = 0 }) =>
        sql.sumarUso.run(n, dia, mensajes, llamadas, tokensEntrada, tokensSalida, coste),
    };
  }

  return {
    negocio,
    // Única lectura entre negocios: el gasto total del día, para el tope global del .env.
    gastoDia: (dia) => sql.gastoDia.get(dia).coste,
    // Solo para tests y revisión: ejecuta una consulta de lectura sobre toda la base.
    leerTodo: (consulta, ...p) => db.prepare(consulta).all(...p),
    cerrar: () => db.close(),
  };
}
