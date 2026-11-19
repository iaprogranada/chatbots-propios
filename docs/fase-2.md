# Fase 2 · Widget y despliegue

Estado: código listo y probado en local (72 tests; widget probado en navegador de escritorio y móvil con un modelo simulado). Falta el despliegue real: DNS, secretos de GitHub y fusionar en `main`.

## Qué hay

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Widget | `publico/widget.js` | Burbuja «¿Hablamos?» y ventana de chat (diseño C, elegido por Chusi). Shadow DOM, sin cookies, la conversación vive en `sessionStorage` de la pestaña. El texto del bot se pinta como texto; solo los enlaces https y los correos pasan a enlace. |
| Avatar | `publico/avatar-busto.png`, `publico/avatar-cabeza.png` | Busto cuadrado en la cabecera; cabeza y cuello en redondo dentro del botón. |
| Configuración | `GET /widget/config?negocio=<id>` | Solo datos públicos de la ficha (`widget`): saludo, color, etiqueta, texto del botón, botones rápidos, avatares, aviso de privacidad y texto de error con los contactos. |
| Página de prueba | `GET /prueba/<id>` | Página `noindex` para probar el bot antes de ponerlo en la web. |
| Servicio | `deploy/chatbot.service` | systemd, usuario propio `chatbot`, solo escribe en `/var/lib/chatbots-propios`. |
| HTTPS | `deploy/chatbot.caddy` | `chat.iapro.top` → `127.0.0.1:8090`. Archivo aparte + una línea `import` en el Caddyfile: no toca lo del auditor. |
| Despliegue | `.github/workflows/desplegar.yml`, `deploy/instalar.sh` | Al fusionar en `main`: tests, copia por SSH, `npm ci`, `.env` desde los secretos, systemd, Caddy, carga de la web de cada negocio y comprobación de `/salud`. |

## Pasos de Chusi (una sola vez)

1. **DNS en Hostinger**: Dominios → iapro.top → DNS / Nameservers → Añadir registro. Tipo `A`, nombre `chat`, apunta a `2.31.81.50`, TTL por defecto.
2. **Secretos en GitHub**: en el repositorio `chatbots-propios` → Settings → Secrets and variables → Actions → New repository secret. Cuatro secretos:
   - `SERVIDOR_HOST`: `2.31.81.50`
   - `SERVIDOR_USUARIO`: el mismo usuario que usa el auditor para desplegar
   - `SERVIDOR_CLAVE_SSH`: la misma clave privada que tiene el auditor (si no la tienes a mano, se genera una nueva y se añade al servidor)
   - `CLAVE_API_CHATBOT`: la clave de la API del chatbot (la misma que pusiste en el entorno de Claude)
3. **Fusionar el PR**. El despliegue arranca solo; se ve en la pestaña Actions.
4. **Probar** en `https://chat.iapro.top/prueba/iapro`.
5. **Ponerlo en la web**: en Hostinger, en el código personalizado de la web (antes de `</body>`, en todas las páginas), pegar:

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
