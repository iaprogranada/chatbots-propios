#!/usr/bin/env bash
# Se ejecuta EN EL SERVIDOR desde GitHub Actions, después de copiar el código a /opt/chatbots-propios.
# Lee la clave de la API por la entrada estándar (nunca como argumento, para que no salga en la lista de procesos).
# Es idempotente: se puede repetir en cada despliegue.
set -euo pipefail
APP=/opt/chatbots-propios
DATOS=/var/lib/chatbots-propios
PUERTO=8090
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo -n"
if [ "$(id -u)" -eq 0 ]; then COMO_CHATBOT="runuser -u chatbot --"; else COMO_CHATBOT="sudo -n -u chatbot"; fi

# 1. Node 22.13 o más (node:sqlite).
NODE_V=$(node -p 'process.versions.node' 2>/dev/null || echo 0)
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "Hace falta Node 22.13 o más en el servidor (hay $NODE_V)."; exit 1; }

# 2. Usuario propio y carpeta de datos.
id chatbot >/dev/null 2>&1 || $SUDO useradd --system --home "$DATOS" --shell /usr/sbin/nologin chatbot
$SUDO mkdir -p "$DATOS"
$SUDO chown chatbot:chatbot "$DATOS"

# 3. Dependencias.
cd "$APP"
npm ci --omit=dev --no-audit --no-fund

# 4. .env desde la clave recibida (solo lo lee el servicio).
read -r CLAVE
[ -n "$CLAVE" ] || { echo "Falta la clave de la API (secreto CLAVE_API_CHATBOT)."; exit 1; }
umask 077
cat > "$APP/.env.nuevo" <<ENV
PUERTO=$PUERTO
HOST=127.0.0.1
ANTHROPIC_API_KEY=$CLAVE
MODELO=claude-haiku-5-5
TOPE_GASTO_DIARIO=2
DATOS=$DATOS
URL_PUBLICA=https://chat.iapro.top
ENV
$SUDO mv "$APP/.env.nuevo" "$APP/.env"
$SUDO chown chatbot:chatbot "$APP/.env"
$SUDO chmod 600 "$APP/.env"

# 5. El puerto tiene que estar libre (o ser ya nuestro).
if ss -ltnp 2>/dev/null | grep -q ":$PUERTO " && ! systemctl is-active --quiet chatbot; then
  echo "El puerto $PUERTO lo usa otro programa. Cambia PUERTO aquí y en deploy/chatbot.caddy."; exit 1
fi

# 6. Servicio systemd.
$SUDO cp deploy/chatbot.service /etc/systemd/system/chatbot.service
$SUDO systemctl daemon-reload
$SUDO systemctl enable chatbot >/dev/null
$SUDO systemctl restart chatbot

# 7. Caddy: un archivo propio y una línea import en el Caddyfile (sin tocar lo del auditor).
$SUDO cp deploy/chatbot.caddy /etc/caddy/chatbot.caddy
grep -qxF 'import /etc/caddy/chatbot.caddy' /etc/caddy/Caddyfile \
  || echo 'import /etc/caddy/chatbot.caddy' | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null
$SUDO caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
$SUDO systemctl reload caddy

# 8. Cargar (o refrescar) la web de cada negocio, como el usuario del servicio.
for ficha in negocios/*.json; do
  id=$(basename "$ficha" .json)
  $COMO_CHATBOT env DATOS="$DATOS" node --no-warnings=ExperimentalWarning src/cargar.mjs "$id" | tail -n 3
done

# 9. Comprobación.
sleep 2
curl -fsS "http://127.0.0.1:$PUERTO/salud" && echo
echo "Desplegado. Prueba: https://chat.iapro.top/prueba/iapro"
