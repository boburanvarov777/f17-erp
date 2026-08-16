# F17 JEANS & ZARINA DENIM — ERP

Production-grade ERP for the F17 Jeans factory (ZARINA / Melon Fashion Group orders):
orders, models, warehouse, six production stages, RBAC, Telegram bot and Telegram Mini App.

| Layer | Stack |
|---|---|
| Web ERP | Angular 21 · standalone components · signals · zoneless · SCSS design system |
| Backend | NestJS 11 · TypeScript · REST · WebSocket (Socket.IO) · JWT + refresh · RBAC |
| Database | PostgreSQL 17 · Prisma ORM · WAL / streaming replication / PITR |
| Bot | grammY · webhook or long polling · Telegram Mini App (`initData` HMAC verified) |
| Infra | Docker · GitHub Actions · Railway (auto-deploy on push to `main`) |

---

## 1. Quick start (local)

```bash
cp .env.example .env          # fill DATABASE_URL and the JWT secrets
npm install
npm run prisma:generate
npm run prisma:push           # or: npm run prisma:migrate
npm run seed                  # demo departments, roles, users, orders, materials
npm run dev                   # API :3000  ·  Angular :4200
```

Open <http://localhost:4200>. API docs (Swagger): <http://localhost:3000/docs>.

With Docker:

```bash
docker compose up --build     # Postgres (WAL/replication ready) + the app on :3000
```

### Seeded logins

| Login | Password | Role |
|---|---|---|
| `admin` | `Admin!2026` | Super Admin |
| `planning` | `F17erp!2026` | Planning manager |
| `director` | `F17erp!2026` | Production manager |
| `kesim` / `tikuv` / `varka` / `lazer` / `upakovka` / `ortish` | `F17erp!2026` | Stage masters |
| `ombor` | `F17erp!2026` | Warehouse manager |

Change these immediately in any real deployment.

---

## 2. Project layout

```
f17-erp/
├── apps/
│   ├── api/                     NestJS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma    25 tables — the full domain model
│   │   │   └── seed.ts          realistic demo data
│   │   └── src/
│   │       ├── common/          prisma, guards, decorators, filters, permissions
│   │       ├── modules/         auth, users, roles, departments, clients, models,
│   │       │                    orders, production, warehouse, tasks, dashboard,
│   │       │                    notifications, reports, search, audit
│   │       ├── telegram/        bot, Mini App auth, i18n
│   │       └── realtime/        WebSocket gateway
│   └── web/                     Angular 21
│       └── src/app/
│           ├── core/            api, auth, i18n, theme, realtime, guards, interceptors
│           ├── shared/          design-system components and pipes
│           ├── layout/          shell (sidebar, topbar, Ctrl+K search)
│           └── features/        dashboard, orders, schedule, models, warehouse,
│                                production, tasks, users, roles, departments,
│                                audit, reports, profile, miniapp
├── Dockerfile                   one image: API + bot + built web
├── docker-compose.yml           local Postgres with WAL archiving
├── railway.json                 Railway build/deploy config
└── .github/workflows/ci.yml     type-check + build on every push
```

---

## 3. Modules

**12 core modules** — Dashboard, Orders, Schedule (Gantt), Models, Warehouse,
Cutting, Sewing, Washing, Laser, Packing, Loading, Users — plus Roles,
Departments, Audit logs, Reports, Tasks/Plans and Notifications.

Every list view supports search, filter, sort, pagination and (where useful) CSV
export. Business entities are **archived, never hard-deleted**, so production
history stays intact.

### Production chain

```
Order → Cutting → Sewing → Washing → Laser → Packing → Loading
```

Each stage stores plan / done / defect / remaining, a responsible employee,
start and end dates, and a full operation log. Two rules are enforced in the
database transaction, not just the UI:

1. **A stage can never overtake the stage feeding it.** Sewing cannot record more
   pieces than Cutting has produced.
2. **Operations are reversed, never deleted.** Cancelling an entry writes a
   compensating record so the audit trail is complete.

Stage completion advances the order status automatically
(`NEW → IN_PRODUCTION → READY → LOADING → COMPLETED`), and a scheduled job flags
overdue orders as `DELAYED`.

### Warehouse

Stock is never edited by hand. `IN / OUT / RESERVE / RETURN / INVENTORY`
operations run inside a transaction that writes the resulting balance onto the
ledger row, so the balance can always be replayed. Reserved quantity is
subtracted from available stock before an outbound movement is allowed.

---

## 4. Security

- JWT access tokens (15 min) + rotating refresh tokens stored hashed
- Argon2id password hashing
- RBAC with granular permissions (`orders.create`, `cutting.update`, …)
- **Permissions are enforced on the backend.** The Angular sidebar and buttons
  react to the same permission list, but a hidden button is never the control.
- Rate limiting, Helmet, class-validator on every DTO, whitelisted sort columns
- Telegram `initData` verified with `HMAC_SHA256(bot_token, "WebAppData")`
- Audit log: who / what / when / entity / old value / new value / IP / device

---

## 5. Telegram bot

```
/start → language (UZ / RU / EN) → share phone via button → verification → Mini App
```

Phone verification is deliberately strict — the bot rejects:

- manually typed or pasted numbers (plain text is never accepted),
- forwarded contacts,
- another person's contact (`contact.user_id !== from.id`),
- numbers that do not match an active ERP user.

Employees cannot self-register: an administrator must create the user in the Web
ERP first. Once verified, the employee can report production output straight from
the chat, and every entry flows through the same transactional service the web
uses — so a bot update and a web update are indistinguishable downstream.

### Mini App

The Mini App (`/miniapp`) is the employee's personal cabinet: daily / weekly /
monthly plan, assigned tasks, and a one-tap form to report completed pieces and
defects for their own department's stage.

---

## 6. Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | HTTP port (Railway sets this) |
| `APP_URL` | Public URL — used for the Telegram webhook |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing secrets |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | Token lifetimes (default `15m` / `30d`) |
| `TELEGRAM_BOT_TOKEN` | BotFather token — **never commit this** |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token Telegram sends back on each webhook call |
| `TELEGRAM_MINIAPP_URL` | Mini App URL (defaults to `$APP_URL/miniapp`) |
| `TELEGRAM_USE_POLLING` | `true` locally, unset in production to use webhooks |
| `SEED_SUPERADMIN_LOGIN` / `SEED_SUPERADMIN_PASSWORD` | First administrator |

---

## 7. Deploying to Railway

1. Create a Railway project and add the **PostgreSQL** plugin.
2. Add a service from this GitHub repository. Railway detects the `Dockerfile`.
3. Set the variables above. `DATABASE_URL` can reference the plugin:
   `${{Postgres.DATABASE_URL}}`.
4. Set `APP_URL` to the generated public domain, and leave
   `TELEGRAM_USE_POLLING` unset so the bot registers a webhook.
5. Push to `main` — Railway rebuilds and redeploys automatically.

The container entrypoint applies the schema (`prisma db push`) and seeds the
database on the very first boot only.

### Postgres standby / PITR

Replication is handled at the database layer, never by writing every row twice
from the application:

```
Application → Primary Postgres → WAL streaming → Standby Postgres
                              ↘ WAL archive → backup storage (daily/weekly/monthly, PITR)
```

`docker-compose.yml` starts the primary with `wal_level=replica`, replication
slots and WAL archiving already enabled.
