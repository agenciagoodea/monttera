# Manual Técnico — Digital Bordados

> Última atualização: 2026-05-19

---

## 1. Visão geral do sistema

Digital Bordados é uma plataforma de e-commerce especializada em bordados digitais, com:

- Catálogo de produtos para venda/download
- Gestão administrativa completa (backoffice)
- Área de clientes com histórico de pedidos e downloads
- Integração com Mercado Pago e PayPal
- Sistema de autenticação por JWT via cookie HTTP-only
- Suporte a LGPD (consentimentos, anonimização, direito ao esquecimento)

---

## 2. Stack tecnológica

| Camada         | Tecnologia                              |
|----------------|-----------------------------------------|
| Frontend       | React 19 + Vite 6 + TypeScript          |
| Backend        | Node.js 20 + Express + TypeScript (tsx) |
| Banco de dados | MySQL 8 (driver mysql2)                 |
| Autenticação   | JWT + cookie HTTP-only (auth_token)     |
| Pagamentos     | Mercado Pago SDK + PayPal REST          |
| E-mail         | Nodemailer + SMTP configurável          |
| Estilização    | Tailwind CSS v4                         |
| Deploy         | DirectAdmin / Phusion Passenger         |

---

## 3. Estrutura de arquivos

```
digitalbordados/
├── src/
│   ├── server/
│   │   ├── db.ts           # Conexão MySQL e criação de schema (migrations)
│   │   └── auth.ts         # Hash/senha, JWT e middlewares
│   ├── components/         # Header, Footer, Banner, Sidebar, ProductCard
│   ├── contexts/           # AuthContext, CartContext
│   ├── layouts/            # AdminLayout (guard de área admin)
│   ├── pages/              # Telas públicas e de cliente
│   ├── pages/admin/        # Telas administrativas
│   ├── lib/utils.ts        # Utilitários (formatCurrency, cn)
│   ├── types.ts            # Contratos/types compartilhados no frontend
│   └── index.css           # Estilos globais e tema
├── server.ts               # Bootstrap, rotas e integrações
├── app.js                  # Entrypoint Phusion Passenger (produção)
├── scripts/
│   ├── doctor.mjs          # Diagnóstico de ambiente
│   ├── build-client.mjs    # Build do frontend
│   ├── postbuild-server.mjs
│   └── prepare-deploy.mjs  # Empacotamento para deploy
├── public/uploads/         # Imagens e arquivos enviados
├── dist/                   # Build de produção gerado
├── .env                    # Variáveis de ambiente (não versionar)
├── .env.example            # Exemplo de variáveis
└── MANUAL_TECNICO_SISTEMA.md
```

---

## 4. Banco de dados

### 4.1 Tecnologia em uso

O sistema utiliza MySQL como único banco de dados oficial.

- Driver: mysql2 (pool de conexões assíncronas com sync-mysql2 para operações síncronas no bootstrap)
- Host de produção: configurado via variável MYSQL_HOST
- Banco: digitalbordados_novo
- Engine: InnoDB / charset utf8mb4

> NOTA: O arquivo database.sqlite que existia na raiz foi removido em 2026-05-19.
> Ele era um artefato histórico e nunca foi utilizado pela aplicação.

### 4.2 Variáveis de conexão (obrigatórias)

```
MYSQL_HOST=<ip-do-servidor>
MYSQL_PORT=3306
MYSQL_DATABASE=digitalbordados_novo
MYSQL_USER=digitalbordados_novo
MYSQL_PASSWORD=<senha>
```

### 4.3 Schema — tabelas principais

| Tabela                      | Descrição                                       |
|-----------------------------|-------------------------------------------------|
| users                       | Usuários admin e clientes                       |
| customers                   | Dados complementares de clientes                |
| categories                  | Categorias com hierarquia por parent_id         |
| tags                        | Tags de produtos                                |
| products                    | Catálogo de produtos                            |
| product_images              | Imagens de galeria                              |
| product_files               | Arquivos para download                          |
| product_tags                | Relação N:N produto x tag                       |
| product_categories          | Relação N:N produto x categoria                 |
| orders                      | Pedidos (suporta MP e PayPal)                   |
| order_items                 | Itens de cada pedido                            |
| settings                    | Configurações globais da plataforma             |
| webhook_logs                | Logs de webhooks recebidos (Mercado Pago)       |
| paypal_webhook_logs         | Logs de webhooks recebidos (PayPal)             |
| payment_logs                | Log unificado de eventos de pagamento           |
| download_tokens             | Tokens de download com expiração                |
| download_logs               | Auditoria de downloads realizados               |
| email_logs                  | Histórico de e-mails enviados                   |
| email_templates             | Templates de e-mail customizáveis               |
| import_logs                 | Logs de importações (ex: migração WooCommerce)  |
| favorites                   | Produtos favoritados por clientes               |
| reviews                     | Avaliações de produtos                          |
| lgpd_requests               | Solicitações LGPD                               |
| lgpd_consents               | Consentimentos ativos                           |
| lgpd_user_acceptances       | Histórico de aceite de termos por usuario       |
| login_parent_attempts       | Auditoria de tentativas de login                |
| email_verification_tokens   | Tokens de verificacão de e-mail                 |

---

�## 5. Controle de acesso e perfis

### 5.1 Perfis implementados

- admin: acesso total ao painel /admin/* e APIs /api/admin/*
- customer: acesso a compra, pedidos e downloads do proprio usuário

O frontend usa user.type para decidir a área:
- type = 'user'     => área admin
- type = 'customer' => área cliente

### 5.2 Sessão e autenticação

- Cookie: auth_token
- Tipo: HTTP-only
- Validade: 7 dias
- JWT secret: variável JWT_SECRET

### 5.3 Usuários seed (acessos iniciais)

Criados/atualizados automaticamente na inicializacão:
- Admin: contato@agenciagoodea.com / 04039866
- Admin: admin@digitalbordados.com / 123456
- Cliente: cliente@teste.com / 123456

ATENCÃO: Remover seed de credenciais fixas antes de produção.
Trocar todas as senhas imediatamente.
Definir JWT_SECRET forte no ambiente.

---

## 6. Rotas frontend

### 6.1 Públicas

- /                 => Home
- /carrinho         => Carrinho e checkout
- /minha-conta      => Conta do cliente
- /login            => Autenticacão
- /cadastro         => Registro

### 6.2 Administrativas

- /admin                         => Dashboard
- /admin/produtos
- /admin/produtos/novo
- /admin/produtos/editar/:id
- /admin/categorias
- /admin/tags
- /admin/pedidos
- /admin/clientes
- /admin/relatorios
- /admin/configuracoes

---

## 7. APIs backend (mapa completo)

### 7.1 Sistema e autenticacão

- GET  /api/health              — Pública
- POST /api/auth/register       — Pública
- POST /api/auth/login          — Pública
- POST /api/auth/logout         — Auth
- GET  /api/auth/me             — Pública

### 7.2 Catálogo público

- GET /api/settings             — Pública
- GET /api/categories           — Pública
- GET /api/products             — Pública
- GET /api/products/:slug       — Pública

### 7.3 Checkout e cliente

- POST /api/checkout                     — Auth
- POST /api/webhooks/mercadopago         — Pública
- POST /api/webhooks/paypal              — Pública
- GET  /api/customer/orders              — Auth
- GET  /api/customer/downloads           — Auth

### 7.4 Admin — produtos / categorias / tags

- GET    /api/admin/products             — Admin
- POST   /api/admin/products             — Admin
- GET    /api/admin/products/:id         — Admin
- PUT    /api/admin/products/:id         — Admin
- DELETE /api/admin/products/:id         — Admin

### 7.5 Admin — pedidos, relatórios, usuários, configurações

- GET /api/admin/orders                  — Admin
- GET /api/admin/orders/:id              — Admin
- PUT /api/admin/orders/:id/status       — Admin
- GET /api/admin/reports                 — Admin
- GET /api/admin/users                   — Admin
- PUT /api/admin/users/:id/role          — Admin
- DELETE /api/admin/users/:id            — Admin
- GET /api/admin/settings                — Admin
- POST /api/admin/settings               — Admin

---

## 8. Fluxos funcionais

### 8.1 Cadastro e login

1. Usuário registra em /cadastro
2. Backend cria users (role customer) + customers
3. Backend gera JWT e grava cookie auth_token
4. Front usa /api/auth/me para restaurar sessão

### 8.2 Compra

1. Carrinho é salvo no localStorage
2. Checkout envia itens para POST /api/checkout
3. Backend valida produtos, cria orders e order_items
4. Backend gera preferência Mercado Pago ou PayPal e retorna URL
5. Front redireciona para pagamento

### 8.3 Pós-pagamento

- Webhook MP registra em webhook_logs e atualiza status
- Webhook PayPal registra em paypal_webhook_logs e atualiza status
- Todos os eventos consolidados em payment_logs
- Em dev existe aprovacão manual (/api/dev/approve-order/:id)

### 8.4 Downloads

- Cliente só visualiza arquivos de pedidos com status='paid'
- Download protegido por token com expiracão (download_tokens)
- Todas as tentativas auditadas em download_logs

---

## 9. Configurações e ambiente

### 9.1 Variáveis de ambiente completas

```
# Banco de dados MySQL (obrigatório)
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_DATABASE=
MYSQL_USER=
MYSQL_PASSWORD=

# Seguranca
JWT_SECRET=

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=

# PayPal
PAYPAL_MODE=sandbox|production
PAYPAL_SANDBOX_CLIENT_ID=
PAYPAL_SANDBOX_CLIENT_SECRET=
PAYPAL_PRODUCTION_CLIENT_ID=
PAYPAL_PRODUCTION_CLIENT_SECRET=
PAYPAL_DEFAULT_CURRENCY=BRL
PAYPAL_BRL_USD_RATE=5.20
PAYPAL_WEBHOOK_ID=

# URL da aplicacão
APP_URL=https://digitalbordados.com.br
```

---

## 10. Integrações externas

### 10.1 Mercado Pago

- SDK oficial (mercadopago v2)
- Webhook: POST /api/webhooks/mercadopago
- notification_url deve apontar para o dominio de producão

### 10.2 PayPal

- API REST (OAuth2)
- Webhook: POST /api/webhooks/paypal
- Suporte a conversão BRL -> USD via PAYPAL_BRL_USD_RATE

---

## 11. Operacão e manutencão

### 11.1 Subir ambiente local

```bash
npm install
cp .env.example .env   # preencher todas as variáveis
npm run dev            # http://localhost:3000
```

### 11.2 Diagnóstico

```bash
npm run doctor            # verificacão padrão
npm run doctor:strict     # falha se houver qualquer aviso
npm run doctor:startup    # simula startup de producão
```

### 11.3 Build e deploy para DirectAdmin

```bash
npm run prepare:deploy
# Faz: doctor:strict -> build -> doctor:startup:strict -> empacota bundle
```

---

## 12. Pontos de atencão técnica

1. ATENCÃO: Credenciais seed hardcoded — remover antes de producão
2. ATENCÃO: Rota /api/dev/approve-order/:id deve ser removida em producão
3. ATENCÃO: notification_url do Mercado Pago deve apontar para dominio real
4. ATENCÃO: Cookie sem secure/sameSite explicito — ajustar para HTTPS
5. OK: database.sqlite removido — sistema opera 100% sobre MySQL

---

## 13. Matriz de acesso

| Perfil             | Permissões                                                    |
|--------------------|---------------------------------------------------------------|
| Visitante          | Ver produtos/categorias, cadastrar, login                     |
| Cliente autenticado | Checkout, pedidos próprios, downloads de pedidos pagos       |
| Admin              | CRUD produtos/categorias/tags, pedidos, relatórios, usuários |

---

## 14. Arquivos-chave para referência

| Arquivo                         | Responsabilidade                              |
|---------------------------------|-----------------------------------------------|
| server.ts                       | Bootstrap, rotas e integrações                |
| src/server/auth.ts              | JWT e middlewares de autenticacão             |
| src/server/db.ts                | Conexão MySQL e schema (migrations)           |
| src/App.tsx                     | Roteamento da SPA                             |
| src/layouts/AdminLayout.tsx     | Guard da área admin                           |
| src/contexts/AuthContext.tsx    | Sessão no frontend                            |
| src/pages/admin/*               | Operacão do backoffice                        |
| scripts/doctor.mjs              | Diagnóstico de ambiente e pré-deploy          |
| app.js                          | Entrypoint Phusion Passenger (producão)       |
