#!/bin/bash
# Run on the server after each release (also called from GitHub Actions).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/f17-erp}"
cd "$APP_DIR"

echo "▸ Pulling latest main…"
git fetch origin main
git reset --hard origin/main

echo "▸ Building & starting containers…"
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

echo "▸ Pruning old images…"
docker image prune -f

echo "✅ Deploy complete — $(git rev-parse --short HEAD)"
