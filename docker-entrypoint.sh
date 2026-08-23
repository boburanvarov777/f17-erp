#!/bin/sh
set -e

echo "▸ Applying database schema…"
npx --workspace apps/api prisma generate
npx --workspace apps/api prisma db push --accept-data-loss

echo "▸ Ensuring audit_logs.telegramUsername column…"
printf '%s\n' 'ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;' \
  | npx --workspace apps/api prisma db execute --schema prisma/schema.prisma --stdin \
  || echo "⚠ telegramUsername column ensure skipped"

echo "▸ Ensuring stage_entries.workerName column…"
printf '%s\n' 'ALTER TABLE "stage_entries" ADD COLUMN IF NOT EXISTS "workerName" TEXT;' \
  | npx --workspace apps/api prisma db execute --schema prisma/schema.prisma --stdin \
  || echo "⚠ workerName column ensure skipped"

echo "▸ Ensuring users.passwordPlain column…"
printf '%s\n' 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordPlain" TEXT;' \
  | npx --workspace apps/api prisma db execute --schema prisma/schema.prisma --stdin \
  || echo "⚠ passwordPlain column ensure skipped"

echo "▸ Ensuring audit_logs.phone column…"
printf '%s\n' 'ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "phone" TEXT;' \
  | npx --workspace apps/api prisma db execute --schema prisma/schema.prisma --stdin \
  || echo "⚠ audit_logs.phone column ensure skipped"

echo "▸ Syncing seed data (roles, users, demo)…"
node apps/api/prisma/compiled/prisma/seed.js || echo "⚠ seed skipped"

echo "▸ Starting F17 ERP…"
exec node apps/api/dist/main.js
