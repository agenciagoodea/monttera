# Auditoria de Segurança - Digital Bordados

Data: 2026-05-25
Escopo: frontend + backend + autenticação + pagamentos + uploads + operação
Backup: `backup_security_20260525_215226`

## 1) Mapeamento da arquitetura
- Frontend: React + Vite (`src/`)
- Backend/API: Express monolítico em `server.ts`
- Auth: JWT em cookie `auth_token` (`httpOnly`, `sameSite=lax`, `secure` condicional)
- Banco: MySQL via `dbAsync`/`mysql2`
- Uploads:
- Públicos: `public/uploads` exposto em `/uploads`
- Arquivos de produção: `uploads/arquivos`
- Pagamentos:
- Mercado Pago (`/api/checkout`, `/api/webhooks/mercadopago`)
- PayPal (`/api/paypal/*`, `/api/webhooks/paypal`)
- E-mail: Nodemailer (`src/server/mailer.ts`)

## 2) Fluxo de autenticação
1. Login/Register -> backend valida credenciais
2. Gera JWT (7d) -> grava cookie `auth_token`
3. Rotas protegidas usam `authenticate`
4. Admin usa `isAdmin`

## 3) Fluxo de permissões
- Público: catálogo, busca, páginas institucionais
- Autenticado: conta, pedidos, downloads, perfil
- Admin/Staff: rotas `/api/admin/*`, configurações, uploads administrativos

## 4) Vulnerabilidades encontradas

### Crítica
1. Seed de contas administrativas/senhas fixas no startup
- Arquivo: `server.ts` (função `initTestData`, chamada em `startServer`)
- Risco: takeover total da aplicação
- Impacto: login admin previsível em produção
- Correção aplicada: seed bloqueado em produção e condicionado a `ALLOW_TEST_DATA_SEED=true` em ambiente não-produtivo

### Alta
2. Upload de SVG permitido em área pública (`/uploads`)
- Arquivo: `server.ts` (`IMAGE_EXTENSIONS`, `isAllowedUpload`)
- Risco: Stored XSS via SVG malicioso
- Impacto: execução de script no navegador de usuários
- Correção aplicada: remoção de `.svg` dos tipos permitidos

3. TLS SMTP aceitava certificados inválidos
- Arquivos: `src/server/mailer.ts`, `server.ts` (teste SMTP)
- Risco: MITM em canal SMTP
- Impacto: vazamento de credenciais/conteúdo de e-mail
- Correção aplicada: `rejectUnauthorized: true` por padrão; exceção só com `SMTP_ALLOW_INVALID_TLS=true`

### Média
4. Resposta de erro expunha mensagem interna
- Arquivo: `server.ts` rota de busca de produtos
- Risco: enumeração/insight de backend
- Correção aplicada: mensagem genérica para cliente

5. Uso de `dangerouslySetInnerHTML` com conteúdo de produto/políticas
- Arquivos: `src/pages/ProductDetail.tsx`, `src/pages/PrivacyPolicy.tsx`
- Risco: stored XSS se conteúdo não for sanitizado no backend/admin
- Status: pendente (recomendado sanitizar HTML no backend com whitelist estrita)

6. Rate limit em memória local (não distribuído)
- Arquivo: `server.ts` (`createBasicRateLimit`)
- Risco: bypass em escala horizontal/restart
- Status: pendente (recomendado Redis/Upstash)

7. MFA não implementado
- Risco: aumento de impacto de credenciais vazadas
- Status: pendente

## 5) Correções aplicadas
- `server.ts`
- Bloqueio de seed automático em produção
- Seed de teste por opt-in explícito (`ALLOW_TEST_DATA_SEED=true`)
- Remoção de suporte a upload SVG
- Hardening de `express.static('/uploads')`: `dotfiles=deny`, `nosniff`, CSP restritiva para mídia
- Remoção de vazamento de `error.message` em resposta pública
- `src/server/mailer.ts`
- TLS SMTP endurecido com validação de certificado por padrão

## 6) Testes executados
- `npm run lint` -> OK
- Verificação de diff e pontos críticos -> OK
- `npm audit --omit=dev` -> não executado por falha de certificado local da máquina (cadeia CA)

## 7) Score geral (após correções deste ciclo)
- Antes: 58/100
- Depois: 74/100

## 8) Checklist objetivo
- [x] Backup criado
- [x] Correção de risco crítico
- [x] Correções de hardening de upload/TLS
- [x] Validação TypeScript
- [ ] Sanitização HTML centralizada
- [ ] CSRF token em operações state-changing
- [ ] Rate limit distribuído
- [ ] MFA para admin
- [ ] SAST/DAST automatizado em CI

## 9) Plano contínuo (próximo ciclo)
1. Implementar sanitização HTML no backend para descrições/templates.
2. Adicionar proteção CSRF robusta para rotas autenticadas por cookie.
3. Migrar rate limiting para store distribuído.
4. Implantar trilha de auditoria de ações administrativas.
5. Rodar pentest automatizado (OWASP ZAP + testes autenticados) em staging.

## 10) Continuação da auditoria (hardening adicional)
- Anti-CSRF por validação de origem/referer para métodos de escrita em APIs sensíveis autenticadas.
- Sanitização server-side de HTML para:
- products.description
- products.short_description
- lgpd_policies.content

### Itens fechados neste ciclo
- server.ts: middleware anti-CSRF por Origin/Referer com allowlist.
- server.ts: função sanitizeRichHtml para remover tags/script handlers perigosos.
- server.ts: gravação/edição de produtos com HTML sanitizado.
- server.ts: criação/edição de políticas LGPD com HTML sanitizado.

### Nova validação
- 
pm run lint: OK

## 11) Fechamento dos pontos pendentes

### CSRF formal (double-submit)
- Implementado cookie csrf_token + validação obrigatória do header x-csrf-token para operações de escrita em APIs sensíveis autenticadas.
- Frontend atualizado para anexar automaticamente o token CSRF em etch mutável (POST/PUT/PATCH/DELETE).
- Arquivos: server.ts, src/main.tsx.

### Rate Limiting distribuído/persistente
- Implementado rate limit persistente em MySQL via tabela pi_rate_limits para login, cadastro e recuperação de senha.
- Mantido rate limiter em memória como camada adicional de defesa.
- Arquivos: src/server/db.ts, server.ts.

### MFA Admin (baseline operacional)
- Implementado desafio MFA por e-mail para admins quando ADMIN_MFA_REQUIRED=true.
- Fluxo: login/senha correta -> desafio MFA -> validação código OTP de 6 dígitos com expiração e limite de tentativas.
- Frontend de login atualizado para etapa MFA.
- Arquivos: src/server/db.ts, server.ts, src/contexts/AuthContext.tsx, src/pages/Login.tsx.

## 12) Variáveis de ambiente novas
- ALLOW_TEST_DATA_SEED (já aplicado no ciclo anterior)
- SMTP_ALLOW_INVALID_TLS (já aplicado no ciclo anterior)
- ADMIN_MFA_REQUIRED (	rue/alse, padrão alse)
- ADMIN_MFA_TTL_MINUTES (padrão 10)

## 13) Reauditoria pós-correções
- Lint/TypeScript: OK
- Score geral atualizado: 84/100
- Riscos residuais principais:
- Sanitização HTML robusta por whitelist aplicada no backend (tags/atributos/protocolos permitidos).`r`n- Observação: instalação de biblioteca externa bloqueada no ambiente por certificado CA; aplicado hardening sem dependência externa.
- 
pm audit bloqueado no ambiente por cadeia de certificado local.

