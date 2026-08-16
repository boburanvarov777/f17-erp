#!/bin/sh
set -e

echo "▸ Applying database schema…"
npx --workspace apps/api prisma db push --skip-generate --accept-data-loss

# Seed once: only when the roles table is still empty.
echo "▸ Checking seed state…"
NEED_SEED=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.role.count()
  .then(c => { console.log(c === 0 ? 'yes' : 'no'); return p.\$disconnect(); })
  .catch(() => { console.log('yes'); process.exit(0); });
" 2>/dev/null | tail -1)

if [ "$NEED_SEED" = "yes" ]; then
  echo "▸ Seeding initial data…"
  (cd apps/api && npx prisma db seed) || echo "⚠ seed skipped"
else
  echo "▸ Database already seeded."
fi

echo "▸ Starting F17 ERP…"
exec node apps/api/dist/main.js
