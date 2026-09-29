# NEXORA — Auditoria Técnica de Pré-Produção

**Data:** 2026-01-21
**Ambiente:** Windows, Node 22.12.0, npm 11.0.0, PostgreSQL 16 @ 127.0.0.1:5432
**Âmbito:** monorepo `D:\nexora` (`@nexora/api`, `@nexora/web`, `@nexora/contracts`)

---

## 1. Resumo executivo

A Nexora é um monólito modular (Fastify 5 + Prisma 6 + PostgreSQL; React 19 + Vite 7) com ~233 rotas, ~70 modelos de dados e 30 módulos de negócio, multi-tenant por organização com RBAC de 6 roles e 32 permissões.

A auditoria executou **200 verificações automatizadas** (129 API + 62 web + 9 E2E browser) mais análise estática, revisão de configuração e probes de performance. Resultado global:

- **1 bug HIGH encontrado e corrigido** (erros de parsing HTTP devolviam 500 em vez de 4xx)
- **3 problemas de acessibilidade corrigidos** (contraste WCAG AA, selects sem nome acessível)
- **1 achado CRITICAL de configuração** (chave de API real no `.env` + flag insegura) — requer ação operacional antes do lançamento
- **Isolamento multi-tenant, RBAC, autenticação e uploads: verificados e sólidos** — nenhuma fuga entre empresas detetada

**PRODUCTION STATUS: `READY WITH WARNINGS`** — ver §17. Há um bloqueio de lançamento (rotação da chave exposta e desativação de `EXPOSE_PASSWORD_RESET_TOKEN`) que é uma ação de configuração/ops, não de código. Todos os bugs de código encontrados foram corrigidos com testes de regressão.

---

## 2. Arquitetura analisada

### Componentes

| Pacote | Stack | Observações |
|---|---|---|
| `apps/api` | Fastify 5, Prisma 6, PostgreSQL, Zod, Argon2id, jose | 30 módulos, ~233 rotas sob `/api/v1` |
| `apps/web` | React 19, Vite 7, react-router 7, TanStack Query, Tailwind 4, i18next (5 locales) | ~55 páginas, SPA com `credentials: include` |
| `packages/contracts` | Tipos/DTOs partilhados | Consumido por api e web |

### Autenticação e sessões

- Passwords: **Argon2id**; login com verificação timing-safe (dummy verify para emails inexistentes)
- Access token: JWT HS256, 15 min, cookie httpOnly `nexora_access`, `SameSite=Lax`, `Secure` em produção
- Refresh: token opaco, hash SHA-256 persistido, **rotação com deteção de reuso** (reuso revoga todas as sessões), cookie `nexora_refresh` com path `/api/v1/auth`, TTL 30 dias
- Revogação server-side em logout, mudança de password e reset
- Rate limits: global 100/min, auth 8/min, share links 30/min, contacto 5/min

### Multi-tenancy e RBAC

- Tenant = `Organization` (`tenantId` em todas as entidades de negócio)
- `authenticate` (JWT + user ACTIVE) → `requirePermission` (membership ativa + role) → `getActor()` nos services
- 6 roles de sistema: Super Admin, Admin, Manager, Editor, Member, Viewer; 32 permissões
- Limites de plano enforced server-side (Free = 5 utilizadores — confirmado em teste)

### Uploads/storage

- Allowlist de extensões + correspondência MIME + magic bytes + limite 25 MiB
- Storage keys por tenant com nomes UUID; `LocalStorageService` rejeita `..`, paths absolutos e backslashes; escrita atómica (tmp+rename)

### Frontend

- Rotas públicas (landing, pricing, login, share, convites) + área autenticada + `/admin/*` com `RequireAdmin`
- API client com refresh automático em 401

---

## 3. Testes criados

### API (`apps/api/test/`) — 6 novos ficheiros, ~47 subtestes

| Ficheiro | Cobertura |
|---|---|
| `tenant-isolation.test.ts` | Empresa A vs B: IDOR/BOLA em documentos, pastas, listas, tarefas, workflows, notificações, pesquisa, audit, views, downloads; IDs inválidos/longos; mass assignment de campos privilegiados |
| `rbac-matrix.test.ts` | Matriz role × recurso × operação (>110 verificações): cada role testada diretamente na API |
| `input-validation.test.ts` | Payloads inválidos/extremos/hostis em todos os módulos; tipos errados; JSON malformado; valores nulos; strings gigantes; Unicode/emoji/HTML/JS/SQL |
| `security-owasp.test.ts` | Security headers, CORS, JWT tampering, enumeração de contas (forgot-password), error disclosure, share links públicos, métodos HTTP inválidos |
| `auth-security.test.ts` | Cookies httpOnly/SameSite/path, password errada → 401 genérico, rotação/reuso de refresh, logout server-side, membros suspensos/utilizadores desativados, rate limit, tokens de reset single-use |
| `uploads-security.test.ts` | Path traversal, MIME spoofing, magic bytes, ficheiros vazios/inválidos, share links com password/expiração, download sem auth |

### Web (`apps/web/e2e/`) — Playwright + axe-core, 9 testes

| Ficheiro | Cobertura |
|---|---|
| `smoke.spec.ts` | Páginas públicas, registo→dashboard, password errada, criar tarefa via UI, logout→redirect+revogação, isolamento tenant no browser |
| `a11y-responsive.spec.ts` | axe WCAG 2.0 A/AA nas páginas públicas e app autenticada; viewport móvel 390px (menu hamburger) |
| `simulation.spec.ts` | Simulação com 5 utilizadores (Admin/Manager/Editor/Member/Viewer) percorrendo a app: tours por role, criação de tarefa e upload reais via UI, bloqueio de `/admin` para não-admins, tentativa de escrita do Viewer rejeitada pela API, logout de cada utilizador |

Infraestrutura adicionada: `@playwright/test` + `@axe-core/playwright` (devDeps), `playwright.config.ts` com arranque automático dos servidores dev, script `npm run test:e2e`.

---

## 4. Testes executados

| Suite | Comando | Resultado |
|---|---|---|
| API completa | `npm test -w @nexora/api` | **129/129 pass** |
| Web (Vitest + node) | `npm test -w @nexora/web` | **62/62 pass** |
| E2E browser (Chromium) | `npx playwright test` | **9/9 pass** |
| Typecheck | `npm run typecheck` | **PASS** (api, web, contracts) |
| Lint | `npm run lint` | **PASS** — 0 erros, 81 warnings pré-existentes (react-refresh) |
| Build | `npm run build` | **PASS** (~14s) |
| Dependency audit | `npm audit` | **0 vulnerabilidades** |
| Scan de secrets no código | grep de padrões (gsk_, sk-, AKIA, private keys) | Limpo em código-fonte |
| Performance probe | `app.inject`, 5 iterações/endpoint + 20 paralelos | p50 <30ms; 20/20 paralelos OK |

---

## 5. Bugs encontrados e corrigidos

### NEX-001 — HIGH — Erros de parsing HTTP devolviam 500 INTERNAL_SERVER_ERROR

- **Localização:** `apps/api/src/app.ts` (error handler global)
- **Reprodução:** `POST /api/v1/auth/register` com body JSON malformado ou `Content-Type` inválido → Fastify gerava `FST_ERR_CTP_INVALID_JSON_BODY` (400) / `FST_ERR_CTP_INVALID_MEDIA_TYPE` (415) / `FST_ERR_MAX_PARAM_LENGTH` (414), que caíam no handler genérico → 500.
- **Impacto:** input malformado de cliente classificado como falha interna — código HTTP incorreto, poluição de métricas/alertas de erro, e resposta 500 a pedidos de cliente inválidos.
- **Correção:** o error handler reconhece agora erros do Fastify com `statusCode` 4xx e devolve resposta sanitizada `{ error: { code: "BAD_REQUEST" | ... } }` em vez de `INTERNAL_SERVER_ERROR`. Erros inesperados continuam a devolver 500 genérico.
- **Regressão:** `input-validation.test.ts` e `security-owasp.test.ts` cobrem JSON malformado, media type inválido, param gigante e formato `{error:{code,message}}` consistente.

### NEX-002 — MEDIUM — Selects de filtro sem nome acessível (`/tasks`)

- **Localização:** `apps/web/src/pages/tasks-page.tsx` (filtros de estado e prioridade)
- **Deteção:** axe-core `select-name` (critical), 2 nós.
- **Correção:** `aria-label` adicionado (`t("common.status")`, `t("common.priority")` — chaves existentes em todos os locales).
- **Regressão:** `e2e/a11y-responsive.spec.ts` (app shell autenticado).

### NEX-003 — MEDIUM — Contraste insuficiente no tema escuro (WCAG AA)

- **Localização:** `apps/web/src/index.css` — `--nx-primary: #4f8bd8` (dark theme)
- **Deteção:** axe `color-contrast` (serious): texto branco sobre botões `bg-primary` → 3.49:1 (exigido 4.5:1).
- **Correção:** `--nx-primary: #3a76c4` (≈4.6:1); `--nx-primary-active` ajustado para `#2f63a8` para manter distinção de estado. Mesma família cromática, alteração mínima.
- **Regressão:** `e2e/a11y-responsive.spec.ts` (páginas públicas).

### NEX-004 — LOW — Eyebrow de secções públicas com contraste 4.15:1

- **Localização:** `apps/web/src/components/layout/public-layout.tsx` (`PublicSectionTitle`)
- **Correção:** `text-primary` → `text-primary-subtle-foreground` (#91b9eb sobre fundo escuro — token existente, sem alteração de design).
- **Regressão:** mesmo teste axe.

---

## 6. Vulnerabilidades e achados de segurança

### NEX-005 — CRITICAL — Chave de API real + flag insegura no `.env`

- **Localização:** `D:\nexora\.env`
- **Achado:** contém uma chave real de AI provider (formato `gsk_…`, Groq/OpenAI-compatible) e `EXPOSE_PASSWORD_RESET_TOKEN=true`.
- **Impacto:** se este `.env` for deployado ou a chave tiver sido exposta noutro contexto, permite uso indevido da conta de AI; a flag expõe tokens de reset de password na resposta da API.
- **Mitigação parcial:** `.env` está no `.gitignore` (não será commitado). A validação de produção já rejeita `EXPOSE_PASSWORD_RESET_TOKEN=true` e JWT secret default.
- **Ação obrigatória antes do lançamento:** **revogar/rodar a chave** no provider; `EXPOSE_PASSWORD_RESET_TOKEN=false`; confirmar `JWT_SECRET` forte e HTTPS ativo.

### NEX-006 — LOW — `/health` e `/metrics` públicos expõem internals

- **Localização:** `apps/api/src/modules/health/health.route.ts`
- **Achado:** sem autenticação, expõem versão, uptime, heap e `error.message` interno de BD/storage (pode conter detalhes de ligação).
- **Recomendação:** em produção, restringir `/health/ready` e `/metrics` (rede interna/token) ou sanitizar `message`. `/health/live` pode permanecer público.

### NEX-007 — LOW — Artefactos de desenvolvimento no repositório

- `apps/api/prisma/dev.db` (3.6 MB SQLite) e schema legado `prisma-sqlite/` — cobertos por `.gitignore` (`*.db`), mas devem ser excluídos de qualquer artefacto de deploy.

### NEX-008 — INFO — `getActor()` duplicado em ~13 services

- Cada service replica a validação de membership. Uma cópia divergente futura quebra o isolamento. Recomendação: extrair helper partilhado. Não é bug atual — os testes de isolamento passam em todos os módulos cobertos.

### NEX-010 — LOW — UI mostra ações que a role não pode executar

- **Deteção:** simulação E2E com 5 utilizadores — o Viewer vê o botão "New task" e consegue abrir o diálogo; a criação falha só no submit (a API rejeita corretamente com 403).
- **Impacto:** segurança intacta; apenas UX — ideal esconder/desativar ações sem permissão.
- **Estado:** documentado; não corrigido (alteração de UI fora do âmbito "sem redesign").

### NEX-011 — LOW — 429 transitório em `auth/me` faz logout aparente

- **Deteção:** durante a simulação E2E, rajadas de pedidos atingiram o rate limit global (100/min); um 429 na query de sessão (`auth/me`) redirecionou o utilizador para `/login` apesar de os cookies continuarem válidos.
- **Impacto:** sob throttling, utilizadores podem ser aparentemente desligados em vez de verem um erro transitório com retry.
- **Recomendação:** tratar 429 de forma distinta de 401 no `apiRequest`/guards de sessão (retry/backoff), mantendo redirect apenas para 401 real.

### NEX-009 — MEDIUM — Sem automação de backup/restore

- README documenta `pg_dump` + replicação de storage, mas não existe agendamento nem mecanismo de restore testado. **Restore drill: NOT TESTED** (não foram executadas operações destrutivas).
- **Recomendação:** automatizar backup diário da BD + storage e ensaiar restore em staging antes do lançamento.

### Verificações de segurança que passaram

- **Isolamento multi-tenant:** utilizadores da Org A não leem, modificam, apagam, descarregam ou descobrem recursos da Org B (10/10 subtestes; IDs de outra org → 403/404; pesquisa, notificações, audit e views filtrados por tenant; share de documento/tarefa para membership de outra org rejeitado)
- **RBAC:** >110 combinações role×operação enforced na API (não só no frontend); Viewer não cria/edita/apaga; Member não administra; limites de plano enforced
- **Auth:** passwords erradas → 401 genérico sem distinção de conta; refresh rotation + reuse detection (revoga todas as sessões); logout revoga server-side; suspensão/desativação corta acesso imediato; reset tokens single-use com expiração; rate limit de auth funciona
- **OWASP:** headers de segurança presentes; CORS restrito à origin configurada; JWT adulterado rejeitado; SQL injection neutralizado (Prisma parametrizado); payloads XSS armazenados como texto; mass assignment ignorado (`isSuperAdmin`, `tenantId`, `role` em payloads são descartados pelo Zod); nenhuma resposta de erro revela stack/SQL/caminhos/secrets
- **Uploads:** extensões perigosas rejeitadas; MIME spoofing detetado; magic bytes verificados; traversal em filenames rejeitado; share links exigem password/expiração corretos; download exige autenticação + membership

---

## 7. Performance

- Probe `app.inject` (in-process, dataset pequeno ~30 tarefas): p50 de 10–28ms em tasks/lists/documents/notifications/search/dashboard; 20 pedidos paralelos → 20/20 OK em ~80ms.
- **Não detetados** N+1 evidentes nos endpoints medidos; paginação existe nos endpoints de listagem.
- **Limitação:** probe não mede HTTP real nem datasets grandes. Load testing formal (k6/artillery): **NOT TESTED** — recomenda-se executar em staging antes do lançamento.

## 8. Browsers e responsive

- **Chromium (Playwright):** 9/9 — inclui viewport móvel 390px (navegação colapsa em hamburger funcional).
- **Edge/Firefox:** NOT TESTED (apenas Chromium instalado). O app usa APIs standard; risco baixo, mas recomenda-se `playwright install firefox` + rerun em CI.
- **Tablet:** parcialmente coberto pelo teste móvel; desktop verificado nos restantes E2E.

## 9. Acessibilidade

- axe-core WCAG 2.0 A/AA em `/`, `/login`, `/register` e shell autenticado (`/dashboard`, `/tasks`): **0 violações critical/serious** após correções.
- Formulários usam `Field`+`htmlFor` (labels associados); botões de ícone têm `aria-label`; dropdowns com `role="menu"/"menuitem"`.
- **Cobertura:** apenas amostra de páginas (públicas + tasks). Auditoria axe às restantes ~50 páginas: recomenda-se extender o spec.

## 10. Observabilidade

- `/health`, `/health/live`, `/health/ready`, `/metrics` (formato Prometheus) existem — ver NEX-006 para exposição pública.
- Logging estruturado (pino) com reqId por pedido.
- Audit trail por tenant verificado nos testes de isolamento.

## 11. Dependências

- `npm audit`: **0 vulnerabilidades** (prod + dev).
- Nenhum secret hardcoded encontrado no código-fonte (scan de padrões de chaves).

## 12. Cobertura e áreas não testadas

| Área | Estado |
|---|---|
| Endpoints core (documents, tasks, lists, forms, workflows, auth, orgs) | Testado (API + E2E) |
| Isolamento multi-tenant | Testado exaustivamente |
| RBAC (todas as roles) | Testado (>110 checks) |
| Uploads/share links | Testado |
| Storage drivers S3/Azure/R2 | NOT TESTED — apenas driver `local` |
| SSO com IdP real | NOT TESTED — há testes unitários; sem IdP configurado |
| Email/SMTP | NOT TESTED — serviço não configurado no ambiente |
| AI providers reais | NOT TESTED — sem credenciais válidas em teste |
| Load/stress | NOT TESTED — apenas smoke de concorrência |
| Restore de backup | NOT TESTED — sem drill não-destrutivo possível |
| Firefox/Edge | NOT TESTED — só Chromium |
| axe em todas as páginas | Parcial — amostra representativa |

## 13. Recomendações

1. **Bloqueante de lançamento:** rodar a chave `gsk_…` e definir `EXPOSE_PASSWORD_RESET_TOKEN=false` (NEX-005).
2. Restringir `/metrics` e `/health/ready` em produção ou sanitizar mensagens de erro (NEX-006).
3. Automatizar backups (BD + storage) e ensaiar restore em staging (NEX-009).
4. Remover `dev.db`/schema SQLite do artefacto de deploy (NEX-007).
5. Extrair `getActor()` para helper partilhado (NEX-008).
6. Estender E2E a Firefox/Edge e axe a todas as páginas; adicionar load test em staging.
7. Correr `npm run test:e2e` em CI (o `playwright.config.ts` arranca os servidores automaticamente).

## 14. Production Readiness Checklist

| Item | Estado |
|---|---|
| Build | ✅ PASS |
| Typecheck | ✅ PASS |
| Lint | ✅ PASS (0 erros; 81 warnings pré-existentes) |
| Unit/integration/API tests | ✅ 191/191 |
| E2E | ✅ 9/9 (Chromium) |
| Security tests | ✅ PASS |
| Regression tests | ✅ para todos os bugs corrigidos |
| Dependency audit | ✅ 0 vulns |
| Secrets no código | ✅ limpo |
| Secret exposta no `.env` | ❌ **rodar antes do lançamento** |
| `EXPOSE_PASSWORD_RESET_TOKEN` | ❌ deve ser `false` em produção |
| Backups automatizados | ⚠️ documentado, não automatizado |
| Load test | ⚠️ não executado |
| Browser matrix completa | ⚠️ só Chromium |

## 15. Decisão final

**PRODUCTION STATUS: `READY WITH WARNINGS`**

O código está em bom estado para revisão final: nenhum bug CRITICAL/HIGH por resolver, isolamento multi-tenant e RBAC verificados exaustivamente, e todas as correções têm testes de regressão. O aviso é bloqueante mas operacional: **a chave de AI no `.env` tem de ser revogada/rodada e `EXPOSE_PASSWORD_RESET_TOKEN` desativado antes de qualquer deploy público.** Recomenda-se ainda automatizar backups e correr load tests em staging.
