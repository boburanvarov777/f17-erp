#!/bin/sh
set -e

echo "▸ Applying database schema…"
npx --workspace apps/api prisma generate
npx --workspace apps/api prisma db push --accept-data-loss

echo "▸ Ensuring audit_logs.telegramUsername column…"
printf '%s\n' 'ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;' \
  | npx --workspace apps/api prisma db execute --schema apps/api/prisma/schema.prisma --stdin

echo "▸ Syncing seed data (roles, users, demo)…"
node apps/api/prisma/compiled/prisma/seed.js || echo "⚠ seed skipped"

echo "▸ Starting F17 ERP…"
exec node apps/api/dist/main.js
