<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy

Aplicação full stack (React + Express) com banco MySQL.

## Run Locally

**Prerequisites:** Node.js e MySQL

1. Instale dependências:
   `npm install`
2. Crie seu `.env` baseado em `.env.example` e configure:
   - `MYSQL_HOST`
   - `MYSQL_PORT`
   - `MYSQL_DATABASE`
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`
   - `JWT_SECRET`
   - `MERCADOPAGO_PUBLIC_KEY`
   - `MERCADOPAGO_ACCESS_TOKEN`
   - `APP_URL`
3. Execute:
   `npm run dev`

## Mercado Pago (Checkout Transparente)

- O backend usa o SDK oficial com `MercadoPagoConfig` + `Payment`.
- Credenciais podem vir de:
  - `settings` (`mercadopago_public_key` / `mercadopago_access_token` ou `mp_public_key` / `mp_access_token`)
  - fallback para `.env`.
- Métodos suportados no checkout:
  - PIX
  - Cartão de Crédito
  - Cartão de Débito

### Sandbox

- Cartão de teste (aprovado): `5031 4332 1540 6351`
- CPF: qualquer CPF válido de teste
- PIX em sandbox pode aprovar automaticamente em alguns segundos.
