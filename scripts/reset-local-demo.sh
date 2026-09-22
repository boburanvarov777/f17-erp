#!/usr/bin/env bash
# Refreshes demo clients/models/orders/materials on a LOCAL database only.
# Usage: npm run local:reset-demo
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "❌ .env topilmadi. Avval: cp .env.example .env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

url="${DATABASE_URL:-}"
if [[ -z "$url" ]]; then
  echo "❌ DATABASE_URL .env da yo‘q"
  exit 1
fi

case "$url" in
  *localhost*|*127.0.0.1*|*@host.docker.internal*)
    ;;
  *)
    echo "❌ Xavfsizlik: DATABASE_URL localhost emas — demo tozalash bloklandi."
    echo "   Hozirgi: ${url%%@*}@…"
    echo "   Faqat lokal PostgreSQL (masalan postgresql://postgres:postgres@localhost:5432/f17erp) uchun."
    exit 1
    ;;
esac

if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "❌ NODE_ENV=production — demo reset bloklandi."
  exit 1
fi

echo "▸ Lokal demo bazani yangilash (users/roles saqlanadi)…"
npm run clean-db
NODE_ENV=development npm run seed
echo "✔ Tayyor. npm run dev bilan kiriting (admin / Admin!2026)."
