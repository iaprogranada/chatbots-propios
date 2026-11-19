#!/usr/bin/env bash
# Lo ejecuta el temporizador chatbot-actualizar del servidor cada 2 minutos, después de bajar main
# a /opt/chatbots-propios-git. Si hay un commit nuevo, lo copia a /opt/chatbots-propios y lo instala.
# La clave de la API vive solo en el servidor, en /etc/chatbots-propios/clave-api (root, 600).
# Nunca pasa por el repositorio.
set -euo pipefail
G=/opt/chatbots-propios-git
APP=/opt/chatbots-propios
D=/etc/chatbots-propios
IMPORT='import /etc/caddy/chatbot.caddy'

# El auditor reescribe el Caddyfile en cada despliegue suyo: si falta la línea del chat, se vuelve a poner.
if [ -f /etc/caddy/chatbot.caddy ] && ! grep -qxF "$IMPORT" /etc/caddy/Caddyfile; then
  echo "$IMPORT" >> /etc/caddy/Caddyfile
  systemctl reload caddy
  echo "Caddy: devuelta la línea del chat."
fi

COMMIT=$(git -C "$G" rev-parse HEAD)
if [ "$(cat "$D/desplegado" 2>/dev/null)" = "$COMMIT" ] && systemctl is-active --quiet chatbot; then exit 0; fi

echo "Desplegando $COMMIT"
mkdir -p "$APP"
rsync -a --delete --exclude .git --exclude node_modules --exclude .env "$G/" "$APP/"
[ -s "$D/clave-api" ] || { echo "Falta $D/clave-api: el chat no puede arrancar."; exit 1; }
bash "$APP/deploy/instalar.sh" < "$D/clave-api"
echo "$COMMIT" > "$D/desplegado"
