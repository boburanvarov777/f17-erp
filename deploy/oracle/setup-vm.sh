#!/bin/bash
# Run ONCE on a fresh Ubuntu 22.04/24.04 ARM VM (Oracle Ampere Always Free).
# Usage: curl -fsSL ... | bash   OR   bash deploy/oracle/setup-vm.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/f17-erp}"
REPO_URL="${REPO_URL:-https://github.com/boburanvarov777/f17-erp.git}"

echo "▸ Installing Docker…"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER" || true

echo "▸ Cloning repository to $APP_DIR…"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "  repo already exists — skip clone"
fi

cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.production.example .env
  echo ""
  echo "⚠  Edit $APP_DIR/.env before first deploy (passwords, APP_URL, JWT, Telegram)."
  echo "   nano $APP_DIR/.env"
fi

echo "▸ Opening firewall port 3000 (optional; use Caddy/Cloudflare on 443 instead)…"
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp || true
  sudo ufw allow 3000/tcp || true
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
fi

echo ""
echo "✅ VM ready. Next steps:"
echo "   1. nano $APP_DIR/.env"
echo "   2. cd $APP_DIR && docker compose -f docker-compose.prod.yml up -d --build"
echo "   3. Add GitHub secrets for CI/CD (see deploy/oracle/README.md)"
