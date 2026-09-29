# NEXORA

Plataforma SaaS empresarial multi-tenant para gestão de conteúdos, colaboração, documentos, tarefas, workflows, aprovações, administração e inteligência artificial.

## Estado do projeto

A NEXORA está funcional e preparada para comercialização como produto SaaS. Esta versão implementa:

- **Identidade e multi-tenancy** — autenticação JWT, refresh tokens com rotação, RBAC, organizações isoladas
- **Documentos** — pastas hierárquicas, upload/download reais, versões, partilha, permissões, favoritos, pesquisa
- **Listas configuráveis** — campos dinâmicos, validação, paginação, exportação CSV, duplicação
- **Formulários** — builder, publicação, submissões, validação, exportação CSV
- **Tarefas** — CRUD, projetos, atribuição, comentários, notificações, vistas lista/kanban/calendário
- **Workflows** — motor de processos, builder, execução, aprovações, ramificações, histórico
- **Aprovações e notificações** — caixa de entrada, delegação, comentários, entrega multi-canal
- **Pesquisa global** — documentos, pastas, listas, registos, tarefas, processos, utilizadores (permission-aware)
- **Administração** — utilizadores, equipas, papéis, permissões, auditoria, configurações
- **Inteligência artificial** — chat, resumo de documentos, propostas de listas/workflows, relatórios (permission-aware)
- **Planos e faturação** — Free, Basic, Professional, Business, Enterprise com limites configuráveis
- **Observabilidade** — health checks, métricas, logs estruturados
- **Segurança** — isolamento total entre tenants, validação de uploads, proteção CSRF, rate limiting

## Arquitetura

```text
Browser
  │
  ▼
React SPA ── REST /api/v1 ── Fastify modular API
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                  Prisma     StorageService   AI Provider
                    │             │           (abstrato)
                    ▼             ▼
              PostgreSQL    Local/S3/R2/Azure
```

### Monorepo

| Pacote | Descrição |
|--------|-----------|
| `@nexora/contracts` | DTOs e tipos partilhados (TypeScript) |
| `@nexora/api` | API REST Fastify + Prisma |
| `@nexora/web` | SPA React + Vite + TanStack Query |

### Decisões técnicas

- **Monólito modular** — fronteiras de domínio claras, extraíveis para microserviços se necessário
- **Prisma ORM** — type-safe, migrações versionadas, PostgreSQL
- **StorageService abstrato** — local agora, S3/R2/Azure via configuração
- **AIProvider abstrato** — local (regras) agora, OpenAI/Anthropic via adapter
- **EmailService abstrato** — SMTP agora, SendGrid/Mailgun via adapter
- **BillingProvider abstrato** — No-op agora, Stripe via adapter
- **Contratos transportáveis** — frontend nunca acede diretamente à base de dados

## Instalação

### Pré-requisitos

- Node.js 22.12+ (ver `engines` em `package.json`)
- npm 10+
- PostgreSQL 13+ (local ou via `docker compose up -d postgres`)

### Desenvolvimento

```bash
# Clonar e instalar dependências
git clone <repo-url> nexora
cd nexora
npm install

# Configurar ambiente
cp .env.example .env
# Editar .env com as suas configurações

# Base de dados (PostgreSQL)
docker compose up -d postgres   # ou apontar DATABASE_URL para uma instância existente
npm run db:generate             # gera o Prisma Client (workspace @nexora/api)

# Aplicar migrações. O Prisma CLI só está instalado em apps/api e NÃO lê o
# .env da raiz, por isso DATABASE_URL tem de estar definido na shell:
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/nexora" npx prisma migrate deploy
# PowerShell: $env:DATABASE_URL="postgresql://..."; npx prisma migrate deploy
cd ../..

# Iniciar em desenvolvimento (API + Web)
npm run dev
```

> A API (`apps/api/src/config/env.ts`) carrega automaticamente o `.env` da raiz; apenas o Prisma CLI precisa de `DATABASE_URL` na shell.

### Testes

Os testes da API usam a base de dados `nexora_test` (configurada em `apps/api/test/.env.test`). Antes da primeira execução, e sempre que houver novas migrações:

```bash
cd apps/api
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/nexora_test" npx prisma migrate deploy
```

- API: http://localhost:3000/api/v1
- Web: http://localhost:5173

### Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `NODE_ENV` | `development` | Ambiente |
| `API_HOST` | `127.0.0.1` | Host da API |
| `API_PORT` | `3000` | Porta da API |
| `WEB_ORIGIN` | `http://localhost:5173` | Origem do frontend (CORS) |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/nexora` | URL da base de dados PostgreSQL |
| `STORAGE_DRIVER` | `local` | Driver de armazenamento (`local` ou `s3`) |
| `STORAGE_LOCAL_ROOT` | `./storage` | Raiz do armazenamento local |
| `S3_ENDPOINT` | — | Endpoint S3 (para R2/MinIO) |
| `S3_REGION` | `us-east-1` | Região S3 |
| `S3_BUCKET` | — | Bucket S3 |
| `S3_ACCESS_KEY_ID` | — | Access key S3 |
| `S3_SECRET_ACCESS_KEY` | — | Secret key S3 |
| `S3_FORCE_PATH_STYLE` | `false` | Path style para MinIO/R2 |
| `JWT_ACCESS_SECRET` | — | Secret JWT (mín. 32 chars em produção) |
| `JWT_ACCESS_TTL_MINUTES` | `15` | TTL do access token |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | TTL do refresh token |
| `SMTP_HOST` | — | Host SMTP (email) |
| `SMTP_PORT` | `587` | Porta SMTP |
| `SMTP_SECURE` | `false` | TLS SMTP |
| `SMTP_USER` | — | Utilizador SMTP |
| `SMTP_PASSWORD` | — | Password SMTP |
| `MAIL_FROM` | `no-reply@nexora.local` | Remetente email |

## Deployment

### Produção

```bash
# Build (requer devDependencies instaladas: typescript, prisma, vite…)
npm ci
npm run db:generate
npm run build

# Migrar base de dados (DATABASE_URL definido no ambiente)
cd apps/api && npx prisma migrate deploy && cd ../..

# Iniciar API (dist/server.js é o entrypoint; dist/app.js apenas exporta buildApp e não abre a porta)
NODE_ENV=production node apps/api/dist/server.js
# ou: npm run start -w @nexora/api

# Servir frontend (Nginx, Caddy, ou CDN)
# Apontar para apps/web/dist/
```

Em produção a API recusa arrancar se `JWT_ACCESS_SECRET` for o valor por omissão ou se `EXPOSE_PASSWORD_RESET_TOKEN=true`. Defina também `API_HOST=0.0.0.0` quando a API correr num container ou atrás de um proxy noutra máquina.

### Docker

```dockerfile
FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
# Instalação completa: o build precisa de typescript e prisma (devDependencies)
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build -w @nexora/contracts && npm run build -w @nexora/api
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
```

Crie um `.dockerignore` com pelo menos `node_modules`, `**/dist`, `.env`, `apps/api/storage` e `apps/api/prisma/*.db`. **Nunca inclua o `.env` na imagem:** a API carrega-o com `override: true`, pelo que se sobreporia às variáveis de ambiente do container. As migrações devem correr antes do arranque (por exemplo, `docker run … sh -c "cd apps/api && npx prisma migrate deploy"`).

### Proxy reverso (Nginx)

```nginx
server {
    listen 80;
    server_name nexora.example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /var/www/nexora/web/dist;
        try_files $uri /index.html;
    }
}
```

### Health checks

- `GET /api/v1/health` — estado completo (DB, storage, email, memória)
- `GET /api/v1/health/live` — liveness probe
- `GET /api/v1/health/ready` — readiness probe
- `GET /api/v1/metrics` — métricas Prometheus

## API

### Autenticação

Todas as rotas (exceto `/health*`, `/metrics`, `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/plans` e links públicos de partilha) requerem autenticação via cookies httpOnly (SameSite=Lax, Secure em produção):

- `nexora_access` — JWT de acesso (15 min), `path=/`
- `nexora_refresh` — refresh token opaco com rotação (30 dias), `path=/api/v1/auth`

O frontend envia os pedidos com `credentials: "include"` e renova a sessão automaticamente em `401`.

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "João Silva",
  "email": "joao@empresa.com",
  "password": "SenhaForte123",
  "organizationName": "Empresa Lda"
}
```

### Endpoints principais

| Módulo | Endpoints |
|--------|-----------|
| Auth | `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/me` |
| Documents | `/organizations/:org/documents`, `/organizations/:org/folders` |
| Lists | `/organizations/:org/lists`, `/organizations/:org/lists/:id/items` |
| Forms | `/organizations/:org/forms`, `/organizations/:org/forms/:id/submissions` |
| Tasks | `/organizations/:org/tasks`, `/organizations/:org/projects` |
| Workflows | `/organizations/:org/workflows`, `/organizations/:org/workflow-instances` |
| Approvals | `/organizations/:org/approvals` |
| Notifications | `/organizations/:org/notifications` |
| Search | `/organizations/:org/search` |
| Admin | `/organizations/:org/users`, `/organizations/:org/teams`, `/organizations/:org/roles`, `/organizations/:org/audit`, `/organizations/:org/settings` |
| AI | `/organizations/:org/ai/chat`, `/organizations/:org/ai/documents/:id/summarize` |
| Billing | `/plans`, `/organizations/:org/subscription`, `/organizations/:org/usage` |

### Multi-tenancy

Todas as queries filtram por `tenantId` (organization ID). Um utilizador nunca acede a dados de outra organização. O contexto do actor é resolvido em cada pedido via `getActor()` que verifica a associação ativa à organização.

### Permissões (RBAC)

| Papel | Descrição |
|-------|-----------|
| Super Admin | Acesso total à plataforma |
| Admin | Gestão total da organização |
| Manager | Gestão de utilizadores e configurações |
| Editor | Edição de conteúdos e processos (páginas e notícias incluídas); não cria/administra sites (`sites.manage` é exclusivo de Admin/Manager) |
| Member | Colaboração em tarefas e aprovações |
| Viewer | Consulta apenas |

## Planos

| Plano | Preço/mês | Utilizadores | Storage | Documentos | Workflows | IA/mês |
|-------|-----------|-------------|---------|-----------|-----------|-------|
| Free | 0€ | 5 | 1 GB | 100 | 5 | 50 |
| Basic | 19€ | 15 | 10 GB | 1.000 | 20 | 500 |
| Professional | 49€ | 50 | 50 GB | 10.000 | 100 | 5.000 |
| Business | 99€ | 200 | 100 GB | 100.000 | 500 | 20.000 |
| Enterprise | 299€ | Ilimitado | Ilimitado | Ilimitado | Ilimitado | Ilimitado |

Os limites são configuráveis por plano via base de dados. Novas organizações recebem o plano Free automaticamente.

## Backups

### Estratégia recomendada

1. **PostgreSQL** — `pg_dump` ou snapshots do volume/instância gerida
2. **Storage** — replicação S3 cross-region ou backup do diretório local
3. **Frequência** — diária (incremental) + semanal (completa)
4. **Retenção** — 30 dias

```bash
# PostgreSQL backup
pg_dump $DATABASE_URL > backups/nexora-$(date +%Y%m%d).sql
```

## Segurança

- **Passwords** — Argon2id
- **JWT** — access tokens curtos (15 min) + refresh tokens com rotação e deteção de reuso
- **Cookies** — httpOnly, SameSite=Lax, Secure em produção
- **Uploads** — validação de MIME type + magic bytes + tamanho máximo
- **Rate limiting** — proteção contra brute force em auth
- **Tenant isolation** — todas as queries filtram por `tenantId`
- **CSRF** — proteção via SameSite=Lax + CORS allowlist
- **CSV** — proteção contra formula injection
- **Email** — HTML escaping em templates

## Desenvolvimento

```bash
# Typecheck
npm run typecheck

# Testes
npm test

# Build
npm run build

# Lint
npm run lint
```

## Licença

Proprietária. Todos os direitos reservados.
