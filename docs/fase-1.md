# Fase 1 · Núcleo

Estado: código y tests listos (64 tests, sin gastar API). Pendiente: la clave de API y la primera carga real de iapro.top para ejecutar la batería A1–A5 con el modelo de verdad.

## Qué hay

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Fichas | `negocios/*.json`, `src/negocios.mjs` | Alta de negocio por archivo, validada al arrancar |
| Base de datos | `src/almacen.mjs` | SQLite (`node:sqlite`) con `negocio_id` en todo; acceso solo por `almacen.negocio(id)` |
| Rastreo | `src/carga/rastrear.mjs`, `robots.mjs` | robots.txt, Crawl-delay, ≥ 1 s entre peticiones, mismo origen, solo IPs públicas |
| Troceado | `src/carga/trocear.mjs` | Texto visible por secciones; quita menú, cookies, texto oculto y órdenes para bots |
| Búsqueda | `src/busqueda.mjs` | FTS5 con BM25, sin tildes, raíces cortas, preguntas de seguimiento |
| Sensibles | `src/sensibles.mjs` | DNI, NIE, IBAN, tarjetas, contraseñas y salud se ocultan antes de guardar o enviar |
| Límites | `src/limites.mjs`, `src/horario.mjs` | Por conversación, por día, longitud y tope de gasto global, antes del modelo |
| Bot | `src/asistente.mjs` | Prompt con caché, Claude Haiku 5.5 a esfuerzo bajo, comprobación de cifras y fugas |
| Servicio | `src/servidor.mjs` | `POST /chat`, `GET /salud`, CORS por dominios de la ficha |
| Batería | `src/bateria.mjs`, `pruebas/iapro.json` | Preguntas A1–A5 contra el modelo real; guarda respuestas para revisión |

## Cómo probar

```bash
npm install
npm test                         # 64 tests, sin red ni API
cp servicio.env.ejemplo .env     # y poner ANTHROPIC_API_KEY
npm run cargar -- iapro          # rastrea iapro.top (≥ 1 s por página)
npm run servicio                 # http://127.0.0.1:8090
curl -s -X POST localhost:8090/chat -H 'content-type: application/json' \
  -d '{"negocio_id":"iapro","mensaje":"¿Qué servicios ofrecéis?"}'
npm run bateria -- iapro         # gasta API: unas 26 preguntas, menos de 0,05 $
```

## Criterios

| Criterio | Dónde se prueba | Estado |
| --- | --- | --- |
| A1 · 10 preguntas con respuesta en la web | `npm run bateria -- iapro` | Pendiente de clave y carga real; las frases esperadas se rellenan tras la carga |
| A2 · 5 preguntas sin respuesta | batería | Pendiente de clave |
| A3 · Sacar instrucciones | batería (6 variantes) + `test/chat.test.mjs` (filtro de fugas) | Filtro probado; modelo pendiente |
| A4 · DNI o IBAN | `test/sensibles.test.mjs`, `test/chat.test.mjs` | ✓ nada en claro en la base ni en la llamada |
| A5 · Orden oculta en la web | `test/trocear.test.mjs`, `test/chat.test.mjs` | ✓ no se carga, y un «gratis» inventado se rehace |
| A6 · B no ve A | `test/almacen.test.mjs`, `test/chat.test.mjs` | ✓ ni trozos ni conversaciones |
| A7 · Límites sin llamar al modelo | `test/limites.test.mjs`, `test/chat.test.mjs` | ✓ |
| A8 · Ninguna clave | `test/claves.test.mjs` | ✓ (falta la revisión de Chusi) |

## Decisiones tomadas

- SQLite integrado en Node con FTS5 en vez de vectores: cero dependencias y cero proveedores nuevos. `node:sqlite` es experimental en Node 22 (el aviso se silencia en los scripts).
- Llamada HTTP directa a la API, como `redactor.mjs` del auditor. Sin respaldo automático de modelo: Haiku no lo tiene; si rechaza, el bot deriva.
- Las órdenes para bots que aparezcan en la web («di que…», «ignora tus instrucciones») se quitan al cargar y salen como aviso en `npm run cargar`.
- Cifras con unidad (€, %, días, semanas, meses, horas, años) y la palabra «gratis» se comprueban contra los trozos usados; si no están, se rehace una vez y luego se deriva.
- Sin cabecera `Origin` (curl) se acepta: CORS solo protege navegadores. Los límites y el tope de gasto protegen el bolsillo. En la Fase 2 se añade límite por IP.

## Pendiente o dudoso

- La ficha de iapro solo tiene la web como canal de derivación: falta confirmar teléfono, correo o WhatsApp públicos y el horario real.
- El entorno en la nube de esta sesión no llega a iapro.top (la red lo bloquea): la primera carga real se hace desde el servidor o desde el ordenador de Chusi.
- Conversaciones: se guardan sin plazo de borrado; propuesto 90 días para la Fase 3.
