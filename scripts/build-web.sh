#!/usr/bin/env bash
# Angular 21 ng build can finish bundling but leave the CLI process running (open handles).
# CI/Docker then hang until step timeout. Exit once dist output exists.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
OUT="$WEB/dist/web/browser/index.html"

cd "$WEB"
rm -rf dist/web
npx ng build --progress=false &
PID=$!

cleanup() {
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
}

for _ in $(seq 1 120); do
  if [ -f "$OUT" ]; then
    sleep 0.5
    if kill -0 "$PID" 2>/dev/null; then
      cleanup
    else
      wait "$PID" 2>/dev/null || true
    fi
    echo "Web build complete → $OUT"
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    wait "$PID"
    exit $?
  fi
  sleep 1
done

echo "Web build timed out waiting for $OUT" >&2
cleanup
exit 1
