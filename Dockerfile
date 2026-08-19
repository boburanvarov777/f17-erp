# ─────────────────────────────────────────────────────────────
# F17 JEANS & ZARINA DENIM — ERP
# Single image: NestJS API + Telegram bot + built Angular app
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

# ---- build ----
FROM deps AS build
COPY . .
RUN npx --workspace apps/api prisma generate
RUN npm run build:web
RUN npm run build:api
RUN npx tsc -p apps/api/tsconfig.seed.json

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma/compiled ./apps/api/prisma/compiled
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/departments/public').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./docker-entrypoint.sh"]
