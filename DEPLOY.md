# Deploy — GitHub + Railway

Everything below is already prepared in this repository: `Dockerfile`,
`railway.json`, `docker-entrypoint.sh` (schema push + first-run seed) and the
GitHub Actions build gate. Two steps remain: publishing the repo and creating
the Railway service.

---

## 1. GitHub

Open Terminal in this folder (`~/Desktop/projects/f17-erp`) and run:

```bash
# The bridge left a broken .git behind — start clean.
rm -rf .git _to_delete

git init -b main
git add -A
git commit -m "feat: F17 JEANS & ZARINA DENIM production ERP"

# Create the repository (needs the GitHub CLI: brew install gh)
gh auth login
gh repo create f17-erp --private --source=. --remote=origin --push
```

Without the GitHub CLI: create an empty **f17-erp** repo at
<https://github.com/new> (no README, no .gitignore), then:

```bash
git remote add origin https://github.com/boburanvarov777/f17-erp.git
git push -u origin main
```

---

## 2. Railway

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo** →
   pick `f17-erp`. Railway detects the `Dockerfile` automatically.
2. In the same project: **New** → **Database** → **PostgreSQL**.
3. Open the app service → **Variables** → add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `NODE_ENV` | `production` |
   | `JWT_ACCESS_SECRET` | a long random string |
   | `JWT_REFRESH_SECRET` | a different long random string |
   | `TELEGRAM_BOT_TOKEN` | your BotFather token |
   | `TELEGRAM_WEBHOOK_SECRET` | any random string |
   | `APP_URL` | the public domain Railway generates |
   | `TELEGRAM_MINIAPP_URL` | `<APP_URL>/miniapp` |

   Generate secrets with:

   ```bash
   openssl rand -hex 32
   ```

   Do **not** set `TELEGRAM_USE_POLLING` in production — leaving it unset makes
   the bot register a webhook at `APP_URL/api/telegram/webhook`.

4. **Settings → Networking → Generate Domain**, then paste that domain into
   `APP_URL` and `TELEGRAM_MINIAPP_URL` and redeploy once.

From here every push to `main` triggers a new Railway build and deploy.

---

## 3. After the first deploy

- Web ERP: `https://<domain>`
- API docs: `https://<domain>/docs`
- Mini App: `https://<domain>/miniapp`

Sign in as `admin` / `Admin!2026` (or whatever `SEED_SUPERADMIN_PASSWORD` was
set to) and **change the password immediately** — the seeded demo accounts all
share one password.

### Telegram

1. BotFather → `/setmenubutton` → choose the bot → paste
   `https://<domain>/miniapp` → give it a title such as “F17 ERP”.
2. BotFather → `/setdomain` → `https://<domain>` so Mini App auth is allowed.
3. Open the bot → `/start` → pick a language → share your phone with the button.
   The phone must match a user created in the Web ERP, otherwise the Mini App
   stays closed — that is intentional.

### Security checklist

- Rotate `TELEGRAM_BOT_TOKEN` in BotFather (`/revoke`) if it has ever been
  pasted into a chat or a file.
- Change every seeded password.
- Keep `.env` out of git — it is already in `.gitignore`.
