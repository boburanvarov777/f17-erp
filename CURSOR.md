# Finishing in Cursor (GitHub + Railway)

Yes — Cursor's agent runs on your own machine with full network access, so it can
do the two things this cloud sandbox cannot: push to GitHub and talk to Railway.

Open this folder in Cursor, start the agent (⌘I), and paste the prompt below.

---

## Prompt to paste into Cursor

```
This is the F17 JEANS & ZARINA DENIM ERP monorepo (Angular 21 + NestJS 11 +
PostgreSQL/Prisma). The code is complete and both apps build cleanly.
Read README.md, RUN.md and DEPLOY.md first, then do the following.

1. Run it locally and confirm login works
   - Start Postgres, copy .env.example to .env, fill DATABASE_URL and generate
     JWT_ACCESS_SECRET / JWT_REFRESH_SECRET with `openssl rand -hex 32`.
   - npm install && npm run prisma:generate
   - npm --workspace apps/api run prisma:push && npm run seed
   - npm run dev
   - Verify: curl -s -X POST http://localhost:3000/api/auth/login \
       -H 'Content-Type: application/json' \
       -d '{"login":"admin","password":"Admin!2026"}'
     It must return accessToken. If it does not, the seed did not run — fix that
     before continuing.

2. Publish to GitHub
   - rm -rf .git _to_delete
   - git init -b main && git add -A && git commit -m "feat: F17 ERP"
   - gh repo create f17-erp --public --source=. --remote=origin --push
     (or push to an existing empty github.com/<me>/f17-erp)

3. Deploy to Railway
   - railway login
   - railway init  (new project, name it f17-erp)
   - railway add --database postgres
   - Set variables on the app service:
       DATABASE_URL=${{Postgres.DATABASE_URL}}
       NODE_ENV=production
       JWT_ACCESS_SECRET=<openssl rand -hex 32>
       JWT_REFRESH_SECRET=<openssl rand -hex 32>
       TELEGRAM_BOT_TOKEN=<my BotFather token>
       TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 16>
     Do NOT set TELEGRAM_USE_POLLING in production.
   - Connect the GitHub repo so pushes to main redeploy automatically.
   - railway domain   → take the generated domain, then set
       APP_URL=https://<domain>
       TELEGRAM_MINIAPP_URL=https://<domain>/miniapp
     and redeploy once.

4. Verify the deployment
   - https://<domain>/api/departments/public returns JSON
   - https://<domain> shows the login page and admin/Admin!2026 works
   - https://<domain>/docs shows Swagger
   - Report the final URL back to me.

The Dockerfile, railway.json and docker-entrypoint.sh are already written —
the entrypoint applies the schema and seeds only on the very first boot. Do not
rewrite them unless something actually fails.
```

---

## After Railway is live

In BotFather:

1. `/setmenubutton` → pick the bot → `https://<domain>/miniapp` → title “F17 ERP”
2. `/setdomain` → `https://<domain>` (required for Mini App auth)
3. `/revoke` if the token has ever been pasted into a chat, then update
   `TELEGRAM_BOT_TOKEN` on Railway.

Then open the bot → `/start` → choose a language → press the contact button. The
phone must match an active user in the Web ERP — edit one of the seeded users to
your real number first (**Foydalanuvchilar → Tahrirlash → Telefon**).
