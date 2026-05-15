# Deploy Digital Bordados — DirectAdmin / Passenger Node.js

> **IMPORTANTE:** Esta aplicação NÃO é um site simples onde basta enviar arquivos.
> Ela depende de build, dependências Node.js e arquivo de inicialização específico.
> **NUNCA** envie arquivos diretamente para a pasta da aplicação via FTP/Gerenciador de Arquivos.

---

## Índice

1. [Entendendo a Arquitetura](#1-entendendo-a-arquitetura)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Configuração Única (Primeira vez)](#3-configuração-única-primeira-vez)
4. [Fluxo de Atualização (Deploy)](#4-fluxo-de-atualização-deploy)
5. [Script Automatizado de Deploy](#5-script-automatizado-de-deploy)
6. [Checklist Pós-Deploy](#6-checklist-pós-deploy)
7. [Diagnóstico de Problemas](#7-diagnóstico-de-problemas)
8. [O que NUNCA fazer](#8-o-que-nunca-fazer)

---

## 1. Entendendo a Arquitetura

```
digitalbordados/             ← Pasta da aplicação
├── dist/                    ← GERADA pelo build (NÃO enviar manualmente)
│   ├── server.cjs           ← Arquivo de startup do Passenger
│   ├── server.js            ← Backend compilado
│   ├── package.json         ← { "type": "commonjs" }
│   └── assets/              ← Frontend compilado (CSS, JS, imagens)
├── uploads/                 ← Arquivos enviados pelo admin (matrizes ZIP)
├── wp-content/              ← Arquivos migrados do WooCommerce (se existir)
├── node_modules/            ← Dependências (instaladas pelo npm)
├── scripts/                 ← Scripts de build e diagnóstico
├── src/                     ← Código-fonte (NÃO roda em produção)
├── server.ts                ← Código-fonte do backend (NÃO roda em produção)
├── package.json             ← Manifesto do projeto
├── .env                     ← Variáveis de ambiente (NUNCA sobrescrever)
└── .npmrc                   ← Configuração do npm
```

### Fluxo de funcionamento:
```
Código-fonte (server.ts + src/) 
    → npm run build 
        → dist/server.cjs (Passenger carrega este arquivo)
        → dist/assets/ (Frontend estático)
```

**O Passenger SOMENTE executa `dist/server.cjs`.** Se a pasta `dist` for apagada ou corrompida, o site retorna **erro 503**.

---

## 2. Pré-requisitos

### No Painel DirectAdmin (Node.js App):
| Configuração | Valor |
|---|---|
| Versão Node.js | **20.x** |
| Modo | `Production` |
| Raiz do aplicativo | `digitalbordados` (pasta com `package.json`) |
| Arquivo de inicialização | `dist/server.cjs` |
| URL do aplicativo | `digitalbordados.com.br` |

### Ferramentas necessárias na máquina local:
- **Node.js 20.x** (exatamente a mesma versão do servidor)
- **npm 10+**
- **Cliente SSH** (Putty, Terminal, ou o SSH do DirectAdmin)
- **Cliente SFTP/SCP** (WinSCP, FileZilla no modo SFTP, ou `scp`)

---

## 3. Configuração Única (Primeira vez)

### 3.1. Crie o `.env` no servidor (via SSH)

```bash
cd ~/digitalbordados
nano .env
```

Cole as variáveis (adapte com seus dados reais):

```env
# Banco de dados MySQL
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=nome_do_banco
MYSQL_USER=usuario_mysql
MYSQL_PASSWORD=sua_senha_aqui

# Autenticação
JWT_SECRET=uma-chave-secreta-longa-e-aleatoria

# Aplicação
NODE_ENV=production
APP_URL=https://digitalbordados.com.br
APP_DOMAIN=digitalbordados.com.br

# Mercado Pago
MERCADOPAGO_PUBLIC_KEY=sua_public_key
MERCADOPAGO_ACCESS_TOKEN=seu_access_token

# Diretórios de downloads (ajuste conforme servidor)
DOWNLOADS_BASE_DIR=/home/seuusuario/digitalbordados/uploads
WOO_UPLOADS_DIR=/home/seuusuario/digitalbordados/wp-content/uploads/woocommerce_uploads

# Segurança
EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24
LOGIN_ATTEMPT_WINDOW_MINUTES=15
LOGIN_ATTEMPT_MAX_FAILS=7
```

### 3.2. Crie a pasta de uploads (se não existir)

```bash
mkdir -p ~/digitalbordados/uploads
chmod 755 ~/digitalbordados/uploads
```

---

## 4. Fluxo de Atualização (Deploy)

### REGRA DE OURO:
> Faça o **build na sua máquina local** e envie apenas os **artefatos prontos** para o servidor.
> **NUNCA** rode `npm run build` no servidor compartilhado (consome muita memória/CPU).

---

### Passo 1 — Build local (na sua máquina)

```bash
# Navegue até a pasta do projeto
cd d:\www\digitalbordados\digitalbordados

# Verifique a versão do Node
node -v
# Deve mostrar v20.x.x

# Limpe e reinstale dependências (se necessário)
rm -rf node_modules dist
npm install --include=dev

# Execute o diagnóstico
npm run doctor:strict

# Gere o build completo
npm run build

# Verifique se o build foi gerado
npm run doctor:startup:strict
```

**Resultado esperado:** Pasta `dist/` com os arquivos:
- `dist/server.cjs` ← startup do Passenger
- `dist/server.js` ← backend compilado
- `dist/package.json` ← `{ "type": "commonjs" }`
- `dist/assets/` ← frontend (HTML, CSS, JS)

### Passo 2 — Prepare os arquivos para envio

Você precisa enviar **APENAS** estes itens para o servidor:

| Arquivo/Pasta | Obrigatório | Quando enviar |
|---|---|---|
| `dist/` (pasta inteira) | ✅ SIM | Sempre |
| `package.json` | ✅ SIM | Quando mudar dependências |
| `package-lock.json` | ✅ SIM | Quando mudar dependências |
| `.npmrc` | ✅ SIM | Quando mudar configurações npm |
| `scripts/` | ✅ SIM | Quando mudar scripts de build |
| `index.html` | ✅ SIM | Quando mudar o HTML base |

| Arquivo/Pasta | ❌ NÃO enviar | Motivo |
|---|---|---|
| `node_modules/` | ❌ NUNCA | Instalar no servidor via `npm install` |
| `.env` | ❌ NUNCA | Já existe no servidor com dados reais |
| `src/` | ⚠️ Opcional | Só código-fonte, não roda em produção |
| `server.ts` | ⚠️ Opcional | Já compilado em dist/server.js |
| `*.zip` | ❌ NUNCA | Arquivos enormes desnecessários |
| `database.sqlite` | ❌ NUNCA | Banco de desenvolvimento local |
| `*.log` | ❌ NUNCA | Logs de desenvolvimento |

### Passo 3 — Envie os arquivos via SFTP/SCP

**Opção A: Via SCP (recomendado)**
```bash
# A partir da sua máquina local, envie a pasta dist completa
scp -r dist/ seuusuario@digitalbordados.com.br:~/digitalbordados/dist/

# Se houve mudança no package.json
scp package.json package-lock.json seuusuario@digitalbordados.com.br:~/digitalbordados/
scp .npmrc seuusuario@digitalbordados.com.br:~/digitalbordados/
scp index.html seuusuario@digitalbordados.com.br:~/digitalbordados/

# Se houve mudança nos scripts
scp -r scripts/ seuusuario@digitalbordados.com.br:~/digitalbordados/scripts/
```

**Opção B: Via WinSCP/FileZilla (SFTP)**
1. Conecte via SFTP (nunca FTP simples)
2. Navegue até `~/digitalbordados/`
3. **Delete a pasta `dist/` antiga** no servidor
4. **Envie a pasta `dist/` nova** do seu computador
5. Se mudou `package.json`, envie também

### Passo 4 — Instale dependências no servidor (via SSH)

⚠️ Este passo só é necessário quando o `package.json` mudou.

```bash
# Acesse o servidor via SSH
ssh seuusuario@digitalbordados.com.br

# Navegue até a pasta
cd ~/digitalbordados

# Verifique a versão do Node
node -v
# DEVE ser v20.x.x

# Instale dependências de produção
npm install --omit=dev --no-audit --no-fund --prefer-offline

# Se der erro EAGAIN:
npm config set jobs 1
npm install --omit=dev --no-audit --no-fund --prefer-offline
```

### Passo 5 — Reinicie a aplicação

**Pelo Painel DirectAdmin:**
1. Acesse **Configuração Node.js**
2. Clique em **Reiniciar**
3. Aguarde 10-15 segundos

**Ou via SSH (se disponível):**
```bash
# Alguns ambientes suportam:
touch ~/digitalbordados/tmp/restart.txt
```

### Passo 6 — Verifique se está funcionando

```bash
# Via SSH:
curl -I https://digitalbordados.com.br/api/health

# Esperado:
# HTTP/1.1 200 OK
```

Ou acesse diretamente no navegador: `https://digitalbordados.com.br`

---

## 5. Script Automatizado de Deploy

Para facilitar, use este comando na sua máquina local:

```bash
npm run deploy:directadmin
```

Isso executa automaticamente:
1. `npm run doctor:strict` — Valida ambiente
2. `npm run build` — Gera o build
3. `npm run doctor:startup:strict` — Confirma que dist/ está pronto

Após o comando passar com sucesso, siga os Passos 3-6 acima para enviar e reiniciar.

---

## 6. Checklist Pós-Deploy

Após cada deploy, verifique:

- [ ] Site carrega normalmente: `https://digitalbordados.com.br`
- [ ] API responde: `https://digitalbordados.com.br/api/health`
- [ ] Login funciona
- [ ] Página de produtos carrega
- [ ] Carrinho funciona
- [ ] Área "Minha Conta > Matrizes Compradas" lista os arquivos
- [ ] Download de matriz funciona
- [ ] Painel admin carrega: `https://digitalbordados.com.br/admin`

---

## 7. Diagnóstico de Problemas

### Erro 503 — Site fora do ar

**Causa mais comum:** Pasta `dist/` ausente ou corrompida.

```bash
# Via SSH, verifique:
cd ~/digitalbordados

# 1. dist/server.cjs existe?
ls -la dist/server.cjs
# Se não existir → refaça o build local e envie novamente

# 2. Node está na versão correta?
node -v
# Deve ser v20.x.x

# 3. Dependências instaladas?
ls node_modules/.package-lock.json
# Se não existir → npm install --omit=dev

# 4. .env existe e tem as variáveis?
cat .env | head -5
# Deve mostrar MYSQL_HOST, JWT_SECRET, etc.

# 5. Teste manual de startup
node dist/server.cjs
# Se mostrar erro, leia a mensagem e corrija
# Ctrl+C para parar
```

### Erro de banco de dados

```bash
# Teste a conexão MySQL
mysql -u seuusuario -p -h 127.0.0.1 nome_do_banco -e "SELECT 1"
```

### Downloads não funcionam

```bash
# Verifique se a pasta de uploads existe
ls -la ~/digitalbordados/uploads/

# Verifique permissões
chmod -R 755 ~/digitalbordados/uploads/

# Verifique se os arquivos ZIP estão lá
find ~/digitalbordados/uploads/ -name "*.zip" | head -10
```

---

## 8. O que NUNCA fazer

| ❌ NUNCA faça isso | ✅ Faça isso em vez |
|---|---|
| Enviar arquivos por FTP sobre a pasta do app | Use SFTP para enviar apenas `dist/` |
| Deletar `dist/` sem ter o novo pronto | Primeiro faça o build local, depois substitua |
| Rodar `npm run build` no servidor compartilhado | Sempre faça o build na sua máquina local |
| Sobrescrever o `.env` do servidor | Edite o `.env` do servidor via SSH/nano |
| Enviar `node_modules/` do seu PC | Sempre rode `npm install` no servidor |
| Enviar `database.sqlite` | O banco é MySQL em produção |
| Alterar a versão do Node sem testar | Sempre teste com Node 20.x |
| Editar arquivos diretamente no servidor | Edite local → build → deploy |

---

## Resumo Rápido (Cola Rápida)

```bash
# === NA SUA MÁQUINA LOCAL ===
cd d:\www\digitalbordados\digitalbordados
npm run deploy:directadmin
# Se passou sem erros, continue ↓

# === ENVIO DOS ARQUIVOS ===
scp -r dist/ usuario@servidor:~/digitalbordados/dist/
# Se mudou package.json:
scp package.json package-lock.json usuario@servidor:~/digitalbordados/

# === NO SERVIDOR (SSH) ===
cd ~/digitalbordados
# Se mudou package.json:
npm install --omit=dev
# Reinicie pelo painel DirectAdmin ou:
touch tmp/restart.txt

# === VERIFICAÇÃO ===
curl -I https://digitalbordados.com.br/api/health
```
