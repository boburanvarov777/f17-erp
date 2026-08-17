#!/usr/bin/env bash
# Warn when API is down — Angular proxy returns 500 for /api/* without a clear error.
set -e
if ! curl -sf --max-time 2 http://127.0.0.1:3000/api/departments/public >/dev/null 2>&1; then
  echo ""
  echo "⚠️  API is not running on http://localhost:3000"
  echo "   /api requests from the web app will fail with 500 until API starts."
  echo ""
  echo "   Fix: npm run dev          (API + web together)"
  echo "    or: npm run dev:api      (separate terminal, then refresh)"
  echo ""
fi
exec npm --workspace apps/web run start
