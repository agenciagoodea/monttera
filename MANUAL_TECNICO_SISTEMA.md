# Manual Tecnico do Sistema - Digital Bordados

> Ultima atualizacao: 2026-05-20

## 1. Visao geral

O sistema Digital Bordados e uma plataforma de e-commerce para venda de matrizes de bordado digital com:

- Loja publica (catalogo, busca, categorias, detalhe de produto)
- Area do cliente (conta, pedidos, downloads, privacidade/LGPD)
- Painel administrativo completo
- Checkout com Mercado Pago e PayPal
- Gerenciamento de arquivos de produto e uploads
- Sistema de e-mails transacionais com templates
- Recursos LGPD (politicas, consentimentos, solicitacoes, exportacao)
- Rotina de backup/restauracao via painel

---

## 2. Stack tecnologica

- Frontend: React 19 + React Router 7 + TypeScript + Vite 6
- Backend: Node.js 20 + Express + TypeScript (tsx em dev)
- Banco: MySQL 8 (mysql2 async + sync-mysql2 para bootstrap/migracoes)
- Auth: JWT em cookie HTTP-only (`auth_token`)
- Uploads: multer
- Pagamentos: Mercado Pago SDK + PayPal REST
- E-mail: Nodemailer + Handlebars templates
- Estilo: Tailwind CSS v4
- Deploy alvo: DirectAdmin / Phusion Passenger

---

## 3. Estrutura principal de arquivos

```txt
digitalbordados/
├── src/
│   ├── components/
│   ├── contexts/
│   ├── layouts/
│   ├── lib/
│   ├── pages/
│   │   └── admin/
│   └── server/
│       ├── auth.ts
│       ├── db.ts
│       ├── dbAsync.ts
│       └── mailer.ts
├── public/
│   └── uploads/
├── scripts/
├── server.ts
├── app.js
├── package.json
├── .env.example
└── MANUAL_TECNICO_SISTEMA.md
```

---

## 4. Modulos e responsabilidades

- `server.ts`: bootstrap do Express, middlewares, rotas API, webhooks, checkout, admin.
- `src/server/db.ts`: criacao/migracao de schema e dados padrao (settings/templates).
- `src/server/dbAsync.ts`: camada async de acesso ao MySQL para operacoes de runtime.
- `src/server/auth.ts`: hash de senha, JWT, middlewares `authenticate` e `isAdmin`.
- `src/App.tsx`: roteamento SPA (publico, cliente, admin) e SEO por rota.
- `src/layouts/AdminLayout.tsx`: guard da area admin no frontend.

---

## 5. Banco de dados

### 5.1 Tabelas principais

- `users`, `customers`
- `products`, `product_categories`, `product_tags`
- `product_category_relations`, `product_tag_relations`
- `product_images`, `product_files`
- `orders`, `order_items`, `order_customer_details`
- `favorites`, `reviews`
- `settings`
- `email_templates`, `email_logs`
- `password_reset_tokens`, `email_verification_tokens`, `login_attempts`
- `download_tokens`, `download_logs`
- `webhook_logs`, `paypal_webhook_logs`, `processed_webhooks`, `payment_logs`
- `import_logs`
- `matrix_requests`, `matrix_request_email_logs`
- `mercadopago_product_sync_logs`
- `system_backups`
- `lgpd_policies`, `lgpd_user_acceptances`, `lgpd_consents`, `lgpd_requests`, `lgpd_logs`, `lgpd_cookie_consents`

### 5.2 Observacoes do schema

- O sistema aplica `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` no bootstrap.
- Existe migracao de taxonomia legada: `categories/tags` -> `product_categories/product_tags`.
- Existem indices para busca e auditoria (produtos, pedidos, tokens, logs, LGPD, downloads).

---

## 6. Autenticacao, sessao e perfis

- Token JWT assinado com `JWT_SECRET`, expiracao de 7 dias.
- Cookie de sessao: `auth_token`.
- Cookie com `httpOnly`, `sameSite=lax`, `secure` dinamico em producao/HTTPS.
- Perfis:
- `admin`: acesso total ao painel e `/api/admin/*`
- `customer`: compra, pedidos, downloads, area de conta

### 6.1 Rate limit e seguranca de login

- Rate limit em:
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/forgot-password`
- Janela/tentativas configuradas por:
- `LOGIN_ATTEMPT_WINDOW_MINUTES`
- `LOGIN_ATTEMPT_MAX_FAILS`

### 6.2 Seeds de usuarios

No startup, o sistema garante usuarios de teste/admin (incluindo `admin@digitalbordados.com` e `contato@agenciagoodea.com`).

Recomendacao obrigatoria de producao: trocar credenciais e revisar necessidade desses seeds.

---

## 7. Frontend - rotas ativas

### 7.1 Publicas

- `/`
- `/loja`
- `/orcamento`
- `/contato`
- `/produto/:slug`
- `/favoritos`
- `/login`
- `/cadastro`
- `/esqueci-senha`
- `/redefinir-senha`
- `/checkout/paypal/success`
- `/checkout/paypal/cancel`
- `/obrigado-compra`
- `/politica`
- `/ajuda`

### 7.2 Cliente

- `/carrinho` (com requisito de usuario registrado)
- `/minha-conta`
- `/minha-conta/pedidos`
- `/minha-conta/downloads`
- `/minha-conta/enderecos`
- `/minha-conta/perfil`
- `/minha-conta/privacidade`
- `/minha-conta/lista-de-desejos`

### 7.3 Admin

- `/admin/`
- `/admin/produtos`
- `/admin/produtos/novo`
- `/admin/produtos/editar/:id`
- `/admin/categorias`
- `/admin/tags`
- `/admin/pedidos`
- `/admin/clientes`
- `/admin/relatorios`
- `/admin/configuracoes`

---

## 8. Backend - mapa de APIs

### 8.1 Sistema e autenticacao

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/resend-verification`
- `GET /api/auth/verify-email`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### 8.2 Catalogo e conteudo publico

- `GET /api/settings`
- `GET /api/categories`
- `GET /api/products`
- `GET /api/products/search`
- `GET /api/products/:slug`
- `GET /api/products/:slug/reviews`

### 8.3 Cliente autenticado

- `GET /api/favorites`
- `POST /api/favorites/:productId`
- `DELETE /api/favorites/:productId`
- `GET /api/customer/account`
- `GET /api/customer/orders`
- `GET /api/customer/orders/:id`
- `GET /api/customer/downloads`
- `GET /api/customer/download-file`
- `PUT /api/customer/profile`
- `PUT /api/customer/password`
- `PUT /api/customer/addresses`
- `POST /api/customer/avatar`
- `GET /api/customer/privacy`
- `PUT /api/customer/privacy/consents`
- `POST /api/customer/privacy/request`
- `GET /api/customer/privacy/export`

### 8.4 Checkout e pagamentos

- `POST /api/checkout`
- `GET /api/checkout/config`
- `GET /api/payments/:payment_id/status`
- `POST /api/paypal/create-order`
- `POST /api/paypal/capture-order`
- `GET /api/checkout/paypal/config`
- `POST /api/webhooks/mercadopago`
- `POST /api/webhooks/paypal`

### 8.5 Admin

Produtos:
- `GET /api/admin/products`
- `POST /api/admin/products`
- `GET /api/admin/products/:id`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `POST /api/admin/products/:id/duplicate`
- `POST /api/admin/products/:id/sync-mercadopago`
- `GET /api/admin/products/:id/sync-mercadopago/logs`

Categorias e tags:
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `POST /api/admin/categories/bulk-delete`
- `GET /api/admin/tags`
- `GET /api/admin/tags/most-used`
- `POST /api/admin/tags`
- `DELETE /api/admin/tags/:id`

Pedidos e relatorios:
- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `PUT /api/admin/orders/:id/status`
- `POST /api/admin/orders/import`
- `GET /api/admin/reports`
- `GET /api/admin/dashboard/stats`

Usuarios:
- `GET /api/admin/users`
- `POST /api/admin/users`
- `POST /api/admin/users/import`
- `PUT /api/admin/users/:id`
- `POST /api/admin/users/:id/update`
- `PUT /api/admin/users/:id/role`
- `DELETE /api/admin/users/:id`
- `GET /api/admin/users/export`

Configuracoes e integracoes:
- `GET /api/admin/settings`
- `POST /api/admin/settings`
- `POST /api/admin/payments/test-connection`
- `GET /api/admin/paypal/test`
- `GET /api/admin/paypal/webhook-logs`

E-mail:
- `GET /api/admin/email-templates`
- `GET /api/admin/email-templates/:key`
- `PUT /api/admin/email-templates/:key`
- `POST /api/admin/email-templates/seed`
- `POST /api/admin/email/test-connection`
- `POST /api/admin/email/send-test`
- `GET /api/admin/email-logs`
- `GET /api/admin/email/budget-logs`
- `POST /api/admin/email/budget-logs/:id/retry`

Backups:
- `GET /api/admin/backups`
- `POST /api/admin/backups/create`
- `GET /api/admin/backups/download/:id`
- `DELETE /api/admin/backups/:id`
- `POST /api/admin/backups/restore/:id`

LGPD admin:
- `GET /api/admin/lgpd/policies`
- `GET /api/admin/lgpd/policies/diff`
- `POST /api/admin/lgpd/policies`
- `PUT /api/admin/lgpd/policies/:id`
- `DELETE /api/admin/lgpd/policies/:id`
- `POST /api/admin/lgpd/policies/:id/activate`
- `GET /api/admin/lgpd/consents`
- `PUT /api/admin/lgpd/consents/:id`
- `GET /api/admin/lgpd/requests`
- `PUT /api/admin/lgpd/requests/:id`
- `GET /api/admin/lgpd/logs`
- `GET /api/admin/lgpd/export/user/:id`

### 8.6 Outras rotas

- `POST /api/matrix-requests`
- `POST /api/admin/upload-logo`
- `GET /robots.txt`
- `GET /sitemap.xml`

### 8.7 Rota de desenvolvimento (uso controlado)

- `POST /api/dev/approve-order/:id`

---

## 9. LGPD e privacidade

Implementacoes disponiveis:

- Politicas versionadas e ativacao de versao
- Consentimentos por chave (`consent_key`) com trilha de auditoria
- Registro de aceite por usuario/politica
- Solicitacoes LGPD (exportacao, atualizacao, exclusao etc.)
- Logs administrativos de operacoes LGPD
- Consentimento de cookies separado (`lgpd_cookie_consents`)

---

## 10. E-mails e templates

- Templates persistidos em `email_templates` (com seed automatico)
- Registro de envios em `email_logs`
- SMTP configuravel por variaveis e/ou settings
- Tipos de templates incluem: boas-vindas, confirmacoes de pedido/pagamento, redefinicao de senha, verificacao de e-mail, fluxo LGPD e solicitacoes de matriz

---

## 11. Uploads e arquivos

- Assets publicos: `public/uploads`
- Arquivos de producao/protegidos podem usar `uploads/arquivos` (dependendo do fluxo)
- Download de arquivos de pedidos via token temporario (`download_tokens`)
- Auditoria de download em `download_logs`

---

## 12. Backups

Fluxo via API admin:

- Criacao de snapshot (dados + `public/uploads`)
- Gera pacote `.tar.gz` em `storage/backups`
- Registro de metadados em `system_backups`
- Download, exclusao e restauracao por ID de backup

---

## 13. Variaveis de ambiente

Base operacional (conforme codigo e `.env.example`):

```env
NODE_ENV=production
APP_URL=https://digitalbordados.com.br
APP_DOMAIN=digitalbordados.com.br

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=digitalbordados_novo
MYSQL_USER=root
MYSQL_PASSWORD=

JWT_SECRET=

MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=

PAYPAL_MODE=sandbox
PAYPAL_SANDBOX_CLIENT_ID=
PAYPAL_SANDBOX_CLIENT_SECRET=
PAYPAL_PRODUCTION_CLIENT_ID=
PAYPAL_PRODUCTION_CLIENT_SECRET=
PAYPAL_DEFAULT_CURRENCY=USD
PAYPAL_BRL_USD_RATE=5.20
PAYPAL_BRL_EUR_RATE=6.00
PAYPAL_WEBHOOK_ID=

PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

DOWNLOADS_BASE_DIR=./uploads
WOO_UPLOADS_DIR=./wp-content/uploads/woocommerce_uploads

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=Digital Bordados
SMTP_FROM_EMAIL=contato@digitalbordados.com.br

EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24
LOGIN_ATTEMPT_WINDOW_MINUTES=15
LOGIN_ATTEMPT_MAX_FAILS=7
```

Observacao: algumas configuracoes tambem podem ser persistidas na tabela `settings` e sobrepoem defaults de runtime.

---

## 14. Comandos operacionais

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
npm run doctor
npm run doctor:strict
npm run doctor:startup
npm run doctor:startup:strict
npm run prepare:deploy
```

---

## 15. Pontos de atencao para producao

- Revisar/remover usuarios seed e senhas padrao.
- Restringir/remover rota de desenvolvimento `/api/dev/approve-order/:id`.
- Definir `JWT_SECRET` forte e exclusivo por ambiente.
- Garantir HTTPS para cookie `secure` e operacao de webhooks.
- Validar credenciais reais de Mercado Pago/PayPal/SMTP antes do go-live.
- Manter politica de backup periodico e teste de restauracao.
