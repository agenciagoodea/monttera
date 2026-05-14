# Deploy em DirectAdmin/Passenger (Node 20 LTS)

## 1) Configuração no painel (obrigatória)
- Versão Node.js: **20.x**
- Modo da aplicação: `Production`
- Raiz do aplicativo: `digitalbordados` (onde está o `package.json`)
- URL do aplicativo: domínio correto (`digitalbordados.com.br`)
- Arquivo de inicialização: `dist/server.cjs`

## 2) Fluxo seguro de instalação/build (evita desalinhamento de ambiente)
Execute via SSH no diretório do app:

```bash
cd ~/digitalbordados
node -v
npm -v

# limpeza de ambiente antigo
rm -rf node_modules dist
npm cache clean --force

# reduzir falhas EAGAIN em hospedagem compartilhada
npm config set jobs 1
npm config set foreground-scripts true

# instalar + validar dependências críticas
npm install --include=dev --no-audit --no-fund --prefer-offline
npm run doctor:strict

# build completo + validação de startup
npm run build
npm run doctor:startup:strict
```

## 3) Reinício do app
No painel Node.js:
1. Salvar configurações
2. Clicar em **Reiniciar**

## 4) Variáveis de ambiente mínimas
- `NODE_ENV=production`
- `APP_URL=https://digitalbordados.com.br`
- `JWT_SECRET=...`
- `MYSQL_HOST=...`
- `MYSQL_PORT=3306`
- `MYSQL_USER=...`
- `MYSQL_PASSWORD=...`
- `MYSQL_DATABASE=...`

## 5) Variáveis recomendadas de segurança
- `EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24`
- `LOGIN_ATTEMPT_WINDOW_MINUTES=15`
- `LOGIN_ATTEMPT_MAX_FAILS=7`

## 6) Checagens pós-deploy
```bash
curl -I https://digitalbordados.com.br/api/health
```
Esperado: `HTTP/1.1 200 OK`.

## 7) Se aparecer 503
Verifique nesta ordem:
1. Node está em `20.x` no painel
2. Raiz da app aponta para pasta com `package.json`
3. Startup file é `dist/server.cjs`
4. `dist/server.cjs` existe após build
5. `npm run doctor:startup:strict` passa sem falhas
6. LVE (PMEM/NPROC/EP) não está estourado

## 8) Observações técnicas desta aplicação
- O backend usa `process.env.PORT` (compatível com Passenger).
- O build gera `dist/server.js` e wrapper `dist/server.cjs`.
- O projeto inclui verificação de ambiente via `scripts/doctor.mjs`.
- Foi aplicada compatibilidade para dependência legada que exige `core-js@2` apenas no escopo do `babel-runtime`.
