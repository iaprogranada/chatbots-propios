# Fase 2 · Widget y despliegue

Estado: código listo y probado en local (72 tests; widget probado en navegador de escritorio y móvil con un modelo simulado). Despliegue automático desde `main` (ver abajo).

## Qué hay

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Widget | `publico/widget.js` | Burbuja «¿Hablamos?» y ventana de chat (diseño C, elegido por Chusi). Shadow DOM, sin cookies, la conversación vive en `sessionStorage` de la pestaña. El texto del bot se pinta como texto; solo los enlaces https y los correos pasan a enlace. |
| Avatar | `publico/avatar-busto.png`, `publico/avatar-cabeza.png` | Busto cuadrado en la cabecera; cabeza y cuello en redondo dentro del botón. |
| Configuración | `GET /widget/config?negocio=<id>` | Solo datos públicos de la ficha (`widget`): saludo, color, etiqueta, texto del botón, botones rápidos, avatares, aviso de privacidad y texto de error con los contactos. |
| Página de prueba | `GET /prueba/<id>` | Página `noindex` para probar el bot antes de ponerlo en la web. |
| Servicio | `deploy/chatbot.service` | systemd, usuario propio `chatbot`, solo escribe en `/var/lib/chatbots-propios`. |
| HTTPS | `deploy/chatbot.caddy` | `chat.iapro.top` → `127.0.0.1:8090`. Archivo aparte + una línea `import` en el Caddyfile: no toca lo del auditor. |
| Despliegue | `deploy/actualizar.sh`, `deploy/instalar.sh` | El servidor baja `main` cada 2 minutos; si hay commit nuevo: `npm ci`, `.env`, systemd, Caddy, carga de la web de cada negocio y comprobación de `/salud`. Los tests corren en GitHub Actions (`pruebas.yml`). |

## Cómo se despliega

El servidor se actualiza solo: un temporizador (`chatbot-actualizar`, cada 2 minutos) baja `main` de este repositorio con una clave de solo lectura (deploy key «servidor-hetzner») y, si hay un commit nuevo, ejecuta `deploy/actualizar.sh` → `deploy/instalar.sh`. No hay claves del servidor guardadas en GitHub.

- Preparación única: flujo `preparar-chatbot` en la rama del mismo nombre del repositorio `auditor-aeo` (usa la clave de despliegue que ya tenía el auditor). Crea la deploy key en el servidor e instala el temporizador.
- La clave de la API vive solo en el servidor: `/etc/chatbots-propios/clave-api` (root, 600).
- DNS: registro `A` `chat` → `2.31.81.50` en Hostinger (hecho el 2026-11-19).
- El despliegue del auditor reescribe el Caddyfile entero; un añadido de systemd en Caddy (`caddy.service.d/chatbot.conf`) y el propio temporizador vuelven a poner la línea `import /etc/caddy/chatbot.caddy`.
- Para ponerlo en la web: en Hostinger, código personalizado antes de `</body>`:

  ```html
  <script src="https://chat.iapro.top/widget.js" data-negocio="iapro" defer></script>
  ```

## Gasto

- Tope de 2 $ al día para todo el servicio (`TOPE_GASTO_DIARIO`), y 20 mensajes por conversación y 300 al día por negocio. Al llegar, el bot da los contactos sin llamar al modelo.
- Recomendado: límite mensual de 10 $ en la consola de Anthropic para la clave del chatbot.
- Pendiente: panel de mensajes y gasto por día y negocio.

## Pendiente o dudoso

- Node 22.13 o más en el servidor: `instalar.sh` lo comprueba y para si no lo hay.
- El puerto 8090 tiene que estar libre: `instalar.sh` lo comprueba.
- Límite por IP (anunciado en la Fase 1): pendiente.
- Recargar la web de cada negocio se hace en cada despliegue; una recarga diaria automática queda para la Fase 3.
