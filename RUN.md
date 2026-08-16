# Running the project locally

Two ways. Docker needs no database setup; the manual path gives you hot reload
on both apps.

---

## A. Docker (simplest)

Requires Docker Desktop.

```bash
cd ~/Desktop/projects/f17-erp

# Optional: put your bot token in a .env next to docker-compose.yml
echo 'TELEGRAM_BOT_TOKEN=<token from BotFather>' > .env
echo 'TELEGRAM_USE_POLLING=true' >> .env

docker compose up --build
```

First boot takes a few minutes (npm install + Angular build inside the image).
It starts PostgreSQL with WAL archiving, applies the schema, seeds the demo data
and serves everything on one port:

- ERP: <http://localhost:3000>
- API docs: <http://localhost:3000/docs>
- Mini App: <http://localhost:3000/miniapp>

Stop with `Ctrl+C`, remove everything with `docker compose down -v`.

---

## B. Manual (hot reload while developing)

You need Node 22+ and a PostgreSQL 14+ server.

```bash
cd ~/Desktop/projects/f17-erp

# 1 — database. With Docker just for Postgres:
docker run -d --name f17-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=f17erp postgres:17-alpine

#     …or with Homebrew:
#     brew install postgresql@17 && brew services start postgresql@17
#     createdb f17erp

# 2 — configuration
cp .env.example .env
#     Edit .env: set DATABASE_URL and both JWT secrets.
#     Generate secrets with: openssl rand -hex 32

# 3 — install and prepare
npm install
npm run prisma:generate
npm --workspace apps/api run prisma:push
npm run seed

# 4 — run both apps
npm run dev
```

- Angular dev server: <http://localhost:4200> (proxies `/api` to the backend)
- NestJS API: <http://localhost:3000>
- Swagger: <http://localhost:3000/docs>

Run them separately if you prefer: `npm run dev:api` and `npm run dev:web`.

---

## Logging in

| Login | Password | Role |
|---|---|---|
| `admin` | `Admin!2026` | Super Admin — sees everything |
| `planning` | `F17erp!2026` | Planning manager |
| `director` | `F17erp!2026` | Production manager |
| `kesim` / `tikuv` / `varka` / `lazer` / `upakovka` / `ortish` | `F17erp!2026` | Stage masters — each sees only their own stage |
| `ombor` | `F17erp!2026` | Warehouse manager |

Sign in as a stage master to see the sidebar shrink to that department's
permissions — the same permission list is enforced again on the backend.

---

## Trying the Telegram bot locally

The bot runs in long-polling mode when `TELEGRAM_USE_POLLING=true`, so no public
URL is needed for `/start`, language selection and phone verification.

```bash
# in .env
TELEGRAM_BOT_TOKEN=<token from BotFather>
TELEGRAM_USE_POLLING=true
```

Verification only succeeds for a phone number that exists on an active user. The
seeded users have placeholder numbers (`+998901110001`…), so edit one of them in
**Foydalanuvchilar** to your real number first, then press the bot's contact
button.

The Mini App itself needs an HTTPS URL, so it only opens once the project is
deployed (or tunnelled, e.g. `ngrok http 3000` with `APP_URL` and
`TELEGRAM_MINIAPP_URL` pointed at the tunnel).

---

## Common issues

**`prisma generate` fails to download engines** — your network is blocking
`binaries.prisma.sh`. Retry on a different connection.

**Port 3000 or 4200 already in use** — `lsof -ti:3000 | xargs kill`.

**`P1001: Can't reach database server`** — Postgres isn't running, or
`DATABASE_URL` in `.env` doesn't match it.

**Angular build fails on fonts** — font inlining is already disabled in
`angular.json`; the app loads Inter from Google Fonts at runtime instead.

---

## “Invalid login or password” on a fresh install

Almost always one of two things. Check in this order:

**1. Is the API actually running?**

```bash
curl -s http://localhost:3000/api/departments/public
```

- Empty / connection refused → the backend is not up. Start it with
  `npm run dev:api` and watch for `F17 ERP API on http://0.0.0.0:3000`.
- A JSON array → the API is fine, go to step 2.

**2. Was the database seeded?**

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"admin","password":"Admin!2026"}'
```

- `{"message":"Login yoki parol noto'g'ri", ...}` → the user does not exist:

  ```bash
  npm --workspace apps/api run prisma:push
  npm run seed
  ```

  The seed prints every login and password when it finishes.

- `{"accessToken":"…"}` → credentials are correct; the browser was talking to
  the wrong place. Make sure you opened **http://localhost:4200** (the Angular
  dev server proxies `/api` to port 3000) and not a stale build.

**Note:** if you set `SEED_SUPERADMIN_PASSWORD` in `.env` before seeding, that
password is the admin's — not `Admin!2026`.
