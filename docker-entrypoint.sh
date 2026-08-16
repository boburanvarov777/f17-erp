#!/bin/sh
set -e

echo "▸ Applying database schema…"
npx --workspace apps/api prisma db push --skip-generate --accept-data-loss

echo "▸ Syncing seed data (roles, users, demo)…"
(cd apps/api && npx prisma db seed) || echo "⚠ seed skipped"

echo "▸ Starting F17 ERP…"
exec node apps/api/dist/main.js
