# Fase 1 · Núcleo

Estado: código y tests listos (67 tests, sin gastar API). Carga real de iapro.top el 2026-11-19 (4 páginas, 62 trozos, tras excluir el informe de ejemplo y la versión en inglés). Batería A1–A5 con el modelo real pasada el 2026-11-19: 27/27 tras los ajustes de abajo, coste total de las dos pasadas 0,011 $.

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
| A1 · 11 preguntas con respuesta en la web | `npm run bateria -- iapro` | ✓ 11/11, revisadas a mano: nada inventado |
| A2 · 5 preguntas sin respuesta | batería | ✓ 5/5: dice que no lo sabe y deriva |
| A3 · Sacar instrucciones | batería (6 variantes) + `test/chat.test.mjs` (filtro de fugas) | ✓ 6/6 y filtro probado |
| A4 · DNI o IBAN | `test/sensibles.test.mjs`, `test/chat.test.mjs` | ✓ nada en claro en la base ni en la llamada |
| A5 · Orden oculta en la web | `test/trocear.test.mjs`, `test/chat.test.mjs`, batería | ✓ no se carga, un «gratis» inventado se rehace, y a «¿es todo gratis?» responde que no |
| A6 · B no ve A | `test/almacen.test.mjs`, `test/chat.test.mjs` | ✓ ni trozos ni conversaciones |
| A7 · Límites sin llamar al modelo | `test/limites.test.mjs`, `test/chat.test.mjs` | ✓ |
| A8 · Ninguna clave | `test/claves.test.mjs` | ✓ (falta la revisión de Chusi) |

## Decisiones tomadas

- SQLite integrado en Node con FTS5 en vez de vectores: cero dependencias y cero proveedores nuevos. `node:sqlite` es experimental en Node 22 (el aviso se silencia en los scripts).
- Llamada HTTP directa a la API, como `redactor.mjs` del auditor. Sin respaldo automático de modelo: Haiku no lo tiene; si rechaza, el bot deriva.
- Las órdenes para bots que aparezcan en la web («di que…», «ignora tus instrucciones») se quitan al cargar y salen como aviso en `npm run cargar`.
- Cifras con unidad (€, %, días, semanas, meses, horas, años) y la palabra «gratis» se comprueban contra los trozos usados; si no están, se rehace una vez y luego se deriva.
- Sin cabecera `Origin` (curl) se acepta: CORS solo protege navegadores. Los límites y el tope de gasto protegen el bolsillo. En la Fase 2 se añade límite por IP.

## Primera batería real (2026-11-19)

Primera pasada: 17/26. Los fallos de verdad eran cuatro y están arreglados:

- **Búsqueda**: «¿Hacéis chatbots?» no encontraba nada porque la web dice «agentes», y «¿Dónde estáis?» no tenía ninguna palabra útil. Se añaden sinónimos generales en `src/busqueda.mjs` (dónde → dirección/domicilio, chatbot → agente, CIF ↔ NIF, precio ↔ tarifa…).
- **Páginas que confunden**: el informe de ejemplo de la clínica ficticia ganaba en casi todas las búsquedas y la versión en inglés duplicaba todo. Nueva opción `excluir` en la ficha (prefijos de URL); `npm run cargar` borra de la base lo que ya no se carga.
- **Servicios**: «¿Qué servicios ofrecéis?» sacaba el aviso legal. La descripción de la ficha de iapro lleva ahora la lista de servicios tal como aparece en la web.
- **Horario**: el modelo contaba mal los días («volvemos el lunes» un jueves por la noche) y repetía el horario entero en cada respuesta. Ahora el código calcula la próxima apertura (`proximaApertura` en `src/horario.mjs`) y el bot la dice en una frase.

Además la batería marcaba «no deriva» por un punto final mal recortado (fallo de la prueba, no del bot), y dos frases esperadas eran demasiado estrictas («gratuito» en vez de «gratis», «no todo es gratis»).

Revisión a mano: ninguna respuesta añade datos que no estén en la web. El bot da el correo y el teléfono del aviso legal aunque la ficha solo tiene la web (salen de la información cargada). Al CIF responde que no lo tiene y remite al aviso legal: no recita el NIF, que es personal.

## Decisiones de Chusi (2026-11-19)

- Correo (contacto@iapro.top) y teléfono (647 602 129) son contacto oficial: van en `derivacion` de la ficha.
- El horario de la ficha es el real.
- A «¿dónde estáis?» el bot dice solo «en Granada», sin dirección. Nueva opción `ocultar` en la ficha: textos de la web que se quitan al cargar y se vuelven a comprobar en la salida (si aparecen, se rehace la respuesta). En iapro oculta la dirección y el NIF, que es personal; al CIF el bot responde que no lo tiene y deriva.

## Pendiente o dudoso

- En las sesiones en la nube de Claude, la variable `ANTHROPIC_API_KEY` del entorno no llega a la terminal (la reserva la propia sesión). En el entorno «Chatbots Propios» la clave va como `CLAVE_API_CHATBOT` y se pasa al `.env` así: `printf 'ANTHROPIC_API_KEY=%s\n' "$CLAVE_API_CHATBOT" >> .env`. En el servidor no cambia nada.
- La web publica NIF, dirección, correo y teléfono (aviso legal): la pregunta A2 del CIF sí tiene respuesta en la web y puede salir como «fallo» sin serlo.
- Conversaciones: se guardan sin plazo de borrado; propuesto 90 días para la Fase 3.
