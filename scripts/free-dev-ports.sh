#!/usr/bin/env bash
# Free local dev ports before starting API + web (avoids proxy 500 / EADDRINUSE).
set -e
for port in 3000 4200; do
  pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "▸ freeing port ${port} (pids: ${pids})"
    kill $pids 2>/dev/null || true
  fi
done
pkill -f "nest start --watch" 2>/dev/null || true
sleep 0.5
