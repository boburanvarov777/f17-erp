#!/bin/bash
# Bir marta serverda: bash deploy/oracle/one-shot.sh
# Docker + app + bepul HTTPS (Cloudflare quick tunnel).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/f17-erp}"
cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.production.example .env
  JWT1=$(openssl rand -hex 32)
  JWT2=$(openssl rand -hex 32)
  PG=$(openssl rand -hex 16)
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$PG/" .env
  sed -i "s/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$JWT1/" .env
  sed -i "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT2/" .env
  echo "▸ Generated secrets in .env — edit APP_URL and TELEGRAM_* before production use."
fi

echo "▸ Starting ERP + Postgres…"
docker compose -f docker-compose.prod.yml up -d --build

echo "▸ Installing cloudflared (free HTTPS URL)…"
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH=$(uname -m)
  case "$ARCH" in
    aarch64|arm64) CF_ARCH=arm64 ;;
    x86_64|amd64) CF_ARCH=amd64 ;;
    *) echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" -o /tmp/cloudflared
  sudo install -m 755 /tmp/cloudflared /usr/local/bin/cloudflared
fi

echo ""
echo "✅ ERP running on http://127.0.0.1:3000"
echo ""
echo "▸ Starting HTTPS tunnel (Ctrl+C to stop tunnel only)…"
echo "  Copy the https://*.trycloudflare.com URL → set APP_URL and TELEGRAM_MINIAPP_URL in .env"
echo ""
exec cloudflared tunnel --url "http://127.0.0.1:3000"
