#!/usr/bin/env bash
#
# Installation tout-en-un du tableau de bord Cultura Sabauda sur un VPS Ubuntu/Debian.
# À lancer en root DEPUIS la racine du dépôt déjà cloné :
#
#   sudo bash deploy/vps-setup.sh [DOMAINE] [EMAIL]
#
#   DOMAINE (optionnel) : ex. dashboard.culturasabauda.eu → configure Nginx + HTTPS (certbot).
#   EMAIL   (optionnel) : contact Let's Encrypt (défaut : franck.monod@culturasabauda.eu).
#
# Sans domaine, le tableau de bord écoute en local (127.0.0.1:PORT) ; ajoutez un proxy plus tard.
# Idempotent : relançable sans danger (met à jour le service et la config).
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-franck.monod@culturasabauda.eu}"
PORT="${DASHBOARD_PORT:-8787}"
SERVICE_USER="guides"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT=/etc/systemd/system/guides-dashboard.service

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then echo "❌ À lancer en root (sudo)." >&2; exit 1; fi

# 1. Node.js 20 LTS si absent ou trop ancien
log "Vérification de Node.js"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJ=$(node -p 'process.versions.node.split(".")[0]')
  [ "$MAJ" -ge 18 ] && NEED_NODE=0 && echo "Node $(node -v) déjà présent."
fi
if [ "$NEED_NODE" -eq 1 ]; then
  echo "Installation de Node 20 LTS (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"

# 2. Utilisateur système dédié + permissions
log "Utilisateur de service ($SERVICE_USER)"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$REPO_DIR"
# Évite le blocage « dubious ownership » de git (repo possédé par $SERVICE_USER, git lancé en root)
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

# 3. .env + token du dashboard
log "Configuration (.env + token)"
[ -f "$REPO_DIR/.env" ] || cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
TOKEN_FILE="$REPO_DIR/.dashboard-token"
if [ -f "$TOKEN_FILE" ]; then
  TOKEN="$(cat "$TOKEN_FILE")"
else
  TOKEN="$(openssl rand -hex 16)"
  echo "$TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"; chown "$SERVICE_USER":"$SERVICE_USER" "$TOKEN_FILE"
fi
echo "Token du tableau de bord enregistré dans $TOKEN_FILE"

# 4. Service systemd
log "Service systemd (guides-dashboard)"
cat > "$UNIT" <<EOF
[Unit]
Description=Tableau de bord Guides d'achat Cultura Sabauda
After=network.target

[Service]
WorkingDirectory=$REPO_DIR
ExecStart=$NODE_BIN src/dashboard/server.mjs
Environment=DASHBOARD_PORT=$PORT
Environment=DASHBOARD_TOKEN=$TOKEN
Restart=always
User=$SERVICE_USER

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now guides-dashboard
sleep 1
systemctl --no-pager --full status guides-dashboard | head -n 6 || true

# 5. Vérification locale
log "Vérification locale"
if curl -fsS "http://127.0.0.1:$PORT/api/overview?token=$TOKEN" | grep -q '"kpis"'; then
  echo "✅ API du tableau de bord opérationnelle."
else
  echo "⚠️  L'API n'a pas répondu comme attendu — voir : journalctl -u guides-dashboard -n 50"
fi

# 6. Reverse proxy HTTPS (si domaine fourni)
if [ -n "$DOMAIN" ]; then
  log "Nginx + HTTPS pour $DOMAIN"
  command -v nginx >/dev/null 2>&1 || apt-get install -y nginx
  command -v certbot >/dev/null 2>&1 || apt-get install -y certbot python3-certbot-nginx
  cat > "/etc/nginx/sites-available/guides-dashboard" <<EOF
server {
  listen 80;
  server_name $DOMAIN;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
  }
}
EOF
  ln -sf /etc/nginx/sites-available/guides-dashboard /etc/nginx/sites-enabled/guides-dashboard
  nginx -t && systemctl reload nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || \
    echo "⚠️  certbot a échoué (DNS de $DOMAIN pointant bien vers ce VPS ?). Relancez : certbot --nginx -d $DOMAIN"
  ACCESS="https://$DOMAIN/?token=$TOKEN"
else
  ACCESS="http://127.0.0.1:$PORT/?token=$TOKEN  (local — pas de domaine fourni)"
fi

log "Terminé"
echo "Tableau de bord : $ACCESS"
echo "Token : $TOKEN  (aussi dans $TOKEN_FILE)"
echo "Logs   : journalctl -u guides-dashboard -f"
echo "MàJ    : cd $REPO_DIR && git pull && systemctl restart guides-dashboard"
