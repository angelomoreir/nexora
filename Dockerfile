# ---- Build stage: compila contracts, api e web ----
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN npm ci

COPY . .
# O frontend resolve a API no mesmo origin (a API serve o SPA em produção).
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run db:generate && npm run build

# ---- Runtime stage: só dependências de produção + artefactos ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/prisma ./apps/api/prisma
RUN npm ci --omit=dev && cd apps/api && npx prisma generate

COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3000
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && exec node dist/server.js"]
