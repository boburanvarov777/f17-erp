# F17 ERP — Oracle Cloud Always Free deploy

Railway trial tugagach, loyihani **bepul Oracle VM**da ishlatish uchun qo‘llanma.

> **Men (AI) sizning Oracle account’ingizga kira olmayman.** Siz VM yaratasiz, keyin bir marta script ishga tushirasiz — keyin `git push` → avtomatik deploy.

---

## Nima olasiz

| Narsa | Oracle Free |
|-------|-------------|
| Server | 4 ARM CPU, 24 GB RAM — **$0/abadiy** |
| PostgreSQL | VM ichida Docker — **doimiy** |
| CI/CD | GitHub Actions → SSH deploy |
| URL | Public IP yoki o‘z domeningiz |
| Bepul domen | Yo‘q — quyidagi variantlar |

---

## 1. Oracle Cloud VM yaratish

1. [cloud.oracle.com](https://cloud.oracle.com) — ro‘yxatdan o‘ting (karta kerak, **pul yechilmaydi** Always Free uchun).
2. **Compute → Instances → Create instance**
3. **Shape:** `VM.Standard.A1.Flex` — 4 OCPU, 24 GB RAM (Always Free)
4. **Image:** Ubuntu 22.04 or 24.04 **aarch64**
5. **Networking:** public IP bering
6. **SSH key** yuklang (`.pub` fayl) — bu key GitHub secret bo‘ladi
7. Create

> Agar A1 “Out of capacity” desa — boshqa region (Frankfurt, Phoenix) yoki kechqurun qayta urining.

**Public IP** ni yozib oling: masalan `123.45.67.89`

---

## 2. Birinchi marta server sozlash

SSH orqali kiring:

```bash
ssh -i ~/.ssh/oracle_key ubuntu@123.45.67.89
```

Serverda:

```bash
git clone https://github.com/boburanvarov777/f17-erp.git /opt/f17-erp
cd /opt/f17-erp
bash deploy/oracle/setup-vm.sh
nano .env   # parollar, APP_URL, JWT, Telegram token
docker compose -f docker-compose.prod.yml up -d --build
```

Tekshirish: `http://123.45.67.89:3000`

---

## 3. URL va domen (HTTPS)

Oracle **bepul domen bermaydi**. Variantlar:

| Variant | Narx | HTTPS | Telegram Mini App |
|---------|------|-------|-------------------|
| `http://IP:3000` | $0 | ❌ | ❌ |
| [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) | $0 | ✅ | ✅ **tavsiya** |
| O‘z domeningiz (`.uz`, `.com`) | ~$5–15/yil | ✅ Caddy/Let’s Encrypt | ✅ |
| `nip.io` (`123-45-67-89.nip.io`) | $0 | ⚠️ qiyin | ⚠️ |

**Telegram bot + Mini App uchun HTTPS shart** → Cloudflare Tunnel yoki o‘z domen.

`.env` da:
```
APP_URL=https://erp.sizning-domen.uz
TELEGRAM_MINIAPP_URL=https://erp.sizning-domen.uz/miniapp
```

---

## 4. GitHub CI/CD

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Qiymat |
|--------|--------|
| `ORACLE_HOST` | `123.45.67.89` yoki domen |
| `ORACLE_USER` | `ubuntu` |
| `ORACLE_SSH_KEY` | private key (.pem) to‘liq matn |
| `ORACLE_APP_DIR` | `/opt/f17-erp` (ixtiyoriy) |

Repo → **Settings → Variables → Actions**:

| Variable | Qiymat |
|----------|--------|
| `ORACLE_DEPLOY_ENABLED` | `true` (secretlar tayyor bo‘lgach) |

Keyin har `git push main` → `.github/workflows/deploy-oracle.yml` serverni yangilaydi.

---

## 5. Ma’lumotlar bazasi

- Postgres `docker-compose.prod.yml` ichida
- Volume: `pg-data` — VM o‘chmasa ma’lumot saqlanadi
- Backup (tavsiya):

```bash
docker exec f17-postgres pg_dump -U postgres f17erp > backup.sql
```

---

## Oracle bo‘lmasa?

| Platform | Narx | Eslatma |
|----------|------|---------|
| **Hetzner CX22** | ~€4/oy | Oson, ishonchli — shu `docker-compose.prod.yml` ishlaydi |
| **Render Free** | $0 | Uxlaydi, DB 90 kun |
| **Railway Hobby** | $5/oy | Avvalgi setup |

---

## Tez-tez so‘raladigan savollar

**Pul yechiladimi?**  
Always Free resurslaridan oshsangiz yechiladi. 1 ta A1 VM + 24 GB RAM — free tier ichida.

**Railway DB ko‘chirish?**  
Trial qayta yoqilmasa export qilib bo‘lmaydi. Backup bo‘lsa: `pg_restore` serverda.

**Kim deploy qiladi?**  
Siz VM + `.env` sozlasiz; keyin GitHub Actions avtomatik.
