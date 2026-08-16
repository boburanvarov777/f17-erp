#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# F17 ERP — local PostgreSQL setup (macOS, no Docker needed)
# Run:  bash setup-db.sh
# ─────────────────────────────────────────────────────────────
set -e

DB_NAME="f17erp"
cd "$(dirname "$0")"

echo "▸ Looking for PostgreSQL…"

if command -v psql >/dev/null 2>&1; then
  echo "  psql found: $(psql --version)"
elif command -v brew >/dev/null 2>&1; then
  echo "  Not found — installing postgresql@17 with Homebrew (a few minutes)…"
  brew install postgresql@17
  brew services start postgresql@17
  # Homebrew keeps versioned formulae off the default PATH.
  export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"
  {
    echo ''
    echo "export PATH=\"$(brew --prefix)/opt/postgresql@17/bin:\$PATH\""
  } >> ~/.zshrc
  echo "  Added postgresql@17 to PATH in ~/.zshrc"
  sleep 5
else
  echo "  ✗ Neither PostgreSQL nor Homebrew is installed."
  echo "    Install Homebrew first:"
  echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi

echo "▸ Making sure the server is running…"
if ! pg_isready -q 2>/dev/null; then
  brew services start postgresql@17 2>/dev/null || brew services start postgresql 2>/dev/null || true
  for i in $(seq 1 20); do
    pg_isready -q 2>/dev/null && break
    sleep 1
  done
fi
pg_isready || { echo "  ✗ PostgreSQL did not start. Check: brew services list"; exit 1; }

echo "▸ Creating the '$DB_NAME' database…"
createdb "$DB_NAME" 2>/dev/null && echo "  created" || echo "  already exists — fine"

# The connection string must match the role that actually owns this install.
PGUSER_NAME="$(whoami)"
URL="postgresql://${PGUSER_NAME}@localhost:5432/${DB_NAME}?schema=public"
echo "▸ Connection string: $URL"

for f in .env apps/api/.env; do
  [ -f "$f" ] || continue
  # macOS sed needs the empty -i argument.
  sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${URL}\"|" "$f"
  echo "  updated $f"
done

echo "▸ Applying the schema…"
npm --workspace apps/api run prisma:push

echo "▸ Seeding demo data…"
npm run seed

echo
echo "✅ Database ready. Start the apps with:"
echo "     npm run dev"
echo "   then open http://localhost:4200  —  admin / Admin!2026"
