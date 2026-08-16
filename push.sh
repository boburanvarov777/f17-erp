#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# F17 ERP — publish this folder to GitHub.
# Run from the project root:   bash push.sh
# ─────────────────────────────────────────────────────────────
set -e

REPO_URL="https://github.com/boburanvarov777/f17-erp.git"

cd "$(dirname "$0")"

echo "▸ Cleaning up leftovers from the file bridge…"
rm -rf _to_delete .git

echo "▸ Creating the repository…"
git init -q -b main
git config user.email "boburanvarov777@gmail.com"
git config user.name "boburanvarov777"

git add -A
git commit -q -m "feat: F17 JEANS & ZARINA DENIM production ERP

Angular 21 + NestJS 11 + PostgreSQL (Prisma) monorepo covering the full factory
flow: orders -> cutting -> sewing -> washing -> laser -> packing -> loading.

Backend: JWT + rotating refresh tokens, argon2id, server-side RBAC, 12 modules,
transactional production entries (a stage can never overtake the stage feeding
it; cancelled operations are reversed, never deleted), warehouse ledger with
stored balances, Socket.IO live updates, hourly deadline watcher.

Telegram: grammY bot with strict contact verification (manual, pasted, forwarded
and third-party contacts rejected) and Mini App initData HMAC verification.

Frontend: standalone components, signals, zoneless CD, lazy routes,
permission-driven sidebar, Ctrl+K search, light/dark design system, UZ/RU/EN.

Infra: single Docker image, docker-compose with WAL archiving, railway.json,
GitHub Actions build gate."

echo "▸ Pushing to $REPO_URL"
git remote add origin "$REPO_URL"
git push -u origin main

echo
echo "✅ Done — https://github.com/boburanvarov777/f17-erp"
echo "   Next: DEPLOY.md, section 2 (Railway)."
