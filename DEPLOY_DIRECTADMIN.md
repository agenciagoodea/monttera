# Guia de Deploy — Digital Bordados no DirectAdmin com Passenger

> Sistema: Node.js 20 + Express + React/Vite + MySQL
> Ambiente: DirectAdmin / Phusion Passenger (hospedagem compartilhada)
> Última atualização: 2026-05-19

---

## AVISO IMPORTANTE

Este sistema usa **MySQL** como banco de dados oficial.
NAO existe SQLite em producao. O banco fica no servidor MySQL da hospedagem.
A pasta dist/ é gerada localmente e enviada ao servidor.
NUNCA rode `npm run build` no servidor compartilhado.

---

## 1. Estrutura correta da aplicacao no servidor

```
~/digitalbordados/           <- raiz da aplicacao no servidor
├── dist/                    <- BUILD GERADO LOCALMENTE (obrigatorio)
│   ├── server.cjs           <- startup do Passenger
│   ├── assets/              <- frontend compilado (JS, CSS)
│   └── ...
├── node_modules/            <- instalado no servidor via npm install
├── public/
│   └── uploads/             <- NUNCA APAGAR (imagens dos produtos)
├── uploads/
│   └── arquivos/            <- NUNCA APAGAR (arquivos ZIP/DST para download)
├── scripts/                 <- scripts auxiliares de build
├── package.json
├── package-lock.json
├── .npmrc
├── index.html
├── app.js                   <- entrypoint do Passenger
└── .env                     <- NUNCA APAGAR (credenciais de producao)
```

---

## 2. O que pode ser enviado ao servidor

| Arquivo/Pasta     | Enviar?    | Quando enviar                   |
|-------------------|------------|---------------------------------|
| dist/             | SEMPRE     | Em todo deploy                  |
| package.json      | SE MUDOU   | Quando adicionar dependencias   |
| package-lock.json | SE MUDOU   | Junto com package.json          |
| .npmrc            | SE MUDOU   | Mudancas de config npm          |
| app.js            | SE MUDOU   | Mudancas no entrypoint          |
| scripts/          | SE MUDOU   | Mudancas nos scripts de build   |
| index.html        | SE MUDOU   | Mudancas no HTML base           |

---

## 3. O que NUNCA deve ser apagado no servidor

| Arquivo/Pasta       | Motivo                                              |
|---------------------|-----------------------------------------------------|
| .env                | Credenciais de producao (MySQL, JWT, MP, PayPal)    |
| public/uploads/     | Imagens e capas dos produtos (exibidas no site)     |
| uploads/arquivos/   | Arquivos ZIP/DST para download pelos clientes       |
| node_modules/       | Dependencias instaladas (recriar e lento)           |

O banco de dados e MySQL — fica no servidor de banco da hospedagem.
Nao ha arquivo de banco para preservar no sistema de arquivos.

---

## 4. Como fazer backup antes de atualizar

### 4.1 Backup das pastas criticas (via SSH)

`ash
# No servidor, faca backup de ambas as pastas
cd ~/digitalbordados
tar -czf backup_uploads_$(date +%Y%m%d).tar.gz public/uploads/
tar -czf backup_arquivos_$(date +%Y%m%d).tar.gz uploads/arquivos/
`"

# Secao 16: expandir preservacao de uploads
# Guia de Deploy — Digital Bordados no DirectAdmin com Passenger

> Sistema: Node.js 20 + Express + React/Vite + MySQL
> Ambiente: DirectAdmin / Phusion Passenger (hospedagem compartilhada)
> Última atualização: 2026-05-19

---

## AVISO IMPORTANTE

Este sistema usa **MySQL** como banco de dados oficial.
NAO existe SQLite em producao. O banco fica no servidor MySQL da hospedagem.
A pasta dist/ é gerada localmente e enviada ao servidor.
NUNCA rode `npm run build` no servidor compartilhado.

---

## 1. Estrutura correta da aplicacao no servidor

```
~/digitalbordados/           <- raiz da aplicacao no servidor
├── dist/                    <- BUILD GERADO LOCALMENTE (obrigatorio)
│   ├── server.cjs           <- startup do Passenger
│   ├── assets/              <- frontend compilado (JS, CSS)
│   └── ...
├── node_modules/            <- instalado no servidor via npm install
├── public/
│   └── uploads/             <- NUNCA APAGAR (imagens dos produtos)
├── uploads/
│   └── arquivos/            <- NUNCA APAGAR (arquivos ZIP/DST para download)
├── scripts/                 <- scripts auxiliares de build
├── package.json
├── package-lock.json
├── .npmrc
├── index.html
├── app.js                   <- entrypoint do Passenger
└── .env                     <- NUNCA APAGAR (credenciais de producao)
```

---

## 2. O que pode ser enviado ao servidor

| Arquivo/Pasta     | Enviar?    | Quando enviar                   |
|-------------------|------------|---------------------------------|
| dist/             | SEMPRE     | Em todo deploy                  |
| package.json      | SE MUDOU   | Quando adicionar dependencias   |
| package-lock.json | SE MUDOU   | Junto com package.json          |
| .npmrc            | SE MUDOU   | Mudancas de config npm          |
| app.js            | SE MUDOU   | Mudancas no entrypoint          |
| scripts/          | SE MUDOU   | Mudancas nos scripts de build   |
| index.html        | SE MUDOU   | Mudancas no HTML base           |

---

## 3. O que NUNCA deve ser apagado no servidor

| Arquivo/Pasta       | Motivo                                              |
|---------------------|-----------------------------------------------------|
| .env                | Credenciais de producao (MySQL, JWT, MP, PayPal)    |
| public/uploads/     | Imagens e capas dos produtos (exibidas no site)     |
| uploads/arquivos/   | Arquivos ZIP/DST para download pelos clientes       |
| node_modules/       | Dependencias instaladas (recriar e lento)           |

O banco de dados e MySQL — fica no servidor de banco da hospedagem.
Nao ha arquivo de banco para preservar no sistema de arquivos.

---

## 4. Como fazer backup antes de atualizar

### 4.1 Backup dos uploads (via SSH)

```bash
# No servidor, crie um backup da pasta de uploads
cd ~/digitalbordados
tar -czf backup_uploads_$(date +%Y%m%d).tar.gz public/uploads/
```

### 4.2 Backup do .env (via SSH ou SFTP)

```bash
cp .env .env.backup_$(date +%Y%m%d)
```

### 4.3 Backup do banco MySQL

Acesse o phpMyAdmin pelo painel DirectAdmin e exporte o banco
`digitalbordados_novo` como SQL antes de qualquer deploy.

---

## 5. Como gerar o build localmente (na sua maquina)

```bash
# Na sua maquina local
cd d:\www\digitalbordados\digitalbordados

# Confirme a versao do Node
node -v
# DEVE ser v20.x.x

# Instale dependencias (se necessario)
npm install

# Execute o diagnostico (valida ambiente)
npm run doctor:strict

# Gere o build completo
npm run build

# Confirme que dist/server.cjs foi gerado
npm run doctor:startup:strict
```

Resultado esperado na pasta dist/:
- dist/server.cjs      <- startup do Passenger
- dist/package.json    <- { "type": "commonjs" }
- dist/assets/         <- frontend compilado

---

## 6. Como gerar o build no servidor

NAO FACA ISSO em hospedagem compartilhada.
O build consome muita memoria e pode travar o servidor ou ser cancelado.
Sempre faca o build localmente e envie apenas a pasta dist/.

---

## 7. Como instalar dependencias no servidor

Esse passo so e necessario quando o package.json mudou.

```bash
# Via SSH no servidor
cd ~/digitalbordados
node -v
# Deve ser v20.x.x

npm install --omit=dev --no-audit --no-fund --prefer-offline

# Se ocorrer erro EAGAIN (falta de recursos):
npm config set jobs 1
npm install --omit=dev --no-audit --no-fund --prefer-offline
```

---

## 8. Como configurar Node.js 20 no DirectAdmin

1. Acesse o painel do DirectAdmin
2. Procure "Configuracao Node.js" ou "Setup Node.js App"
3. Selecione a versao Node.js 20.x
4. Defina o diretorio da aplicacao: ~/digitalbordados
5. Salve as configuracoes

---

## 9. Qual Startup File usar no Passenger

```
Startup File: app.js
```

O arquivo `app.js` na raiz do projeto e o entrypoint do Passenger.
Ele carrega `dist/server.cjs` internamente.

NAO configure `dist/server.cjs` diretamente como Startup File —
use sempre o `app.js` da raiz.

---

## 10. Como configurar variaveis de ambiente

### Via painel DirectAdmin (recomendado)

1. Acesse "Configuracao Node.js" no DirectAdmin
2. Procure a secao de variaveis de ambiente
3. Adicione cada variavel separadamente

### Via SSH (alternativa)

```bash
cd ~/digitalbordados
nano .env
```

Variaveis obrigatorias:

```
MYSQL_HOST=<ip-do-servidor-mysql>
MYSQL_PORT=3306
MYSQL_DATABASE=digitalbordados_novo
MYSQL_USER=digitalbordados_novo
MYSQL_PASSWORD=<sua-senha>

JWT_SECRET=<chave-secreta-longa>
NODE_ENV=production
APP_URL=https://digitalbordados.com.br

MERCADOPAGO_ACCESS_TOKEN=<seu-token>

PAYPAL_MODE=sandbox
PAYPAL_SANDBOX_CLIENT_ID=
PAYPAL_SANDBOX_CLIENT_SECRET=
PAYPAL_BRL_USD_RATE=5.20
```

---

## 11. Como reiniciar a aplicacao

### Pelo painel DirectAdmin

1. Acesse "Configuracao Node.js"
2. Clique em "Reiniciar" ou "Restart"
3. Aguarde 10 a 15 segundos

### Via SSH (metodo Passenger)

```bash
mkdir -p ~/digitalbordados/tmp
touch ~/digitalbordados/tmp/restart.txt
```

---

## 12. Como testar /api/health

```bash
# Via SSH no servidor
curl -I https://digitalbordados.com.br/api/health

# Resposta esperada:
# HTTP/1.1 200 OK
```

Ou acesse diretamente no navegador:
https://digitalbordados.com.br/api/health

---

## 13. Como identificar erro 503

O erro 503 indica que o Passenger nao conseguiu iniciar a aplicacao.

Causas mais comuns:

1. dist/server.cjs nao existe ou esta corrompido
2. Versao do Node incorreta (nao e 20.x)
3. node_modules/ ausente ou incompleto
4. .env ausente ou com variaveis faltando
5. Porta fixa hardcoded no codigo (deve usar process.env.PORT)
6. Erro de sintaxe no codigo compilado

Diagnostico via SSH:

```bash
cd ~/digitalbordados

# 1. dist/server.cjs existe?
ls -lh dist/server.cjs

# 2. Node na versao correta?
node -v

# 3. node_modules instalado?
ls node_modules/.package-lock.json

# 4. .env existe com variaveis?
grep MYSQL_HOST .env

# 5. Teste de startup manual
node dist/server.cjs
# Se mostrar erro, leia a mensagem
# Pressione Ctrl+C para parar
```

---

## 14. Como restaurar a pasta dist

```bash
# Na sua maquina local
cd d:\www\digitalbordados\digitalbordados
npm run build

# Enviar via SCP
scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# Reiniciar no servidor
touch ~/digitalbordados/tmp/restart.txt
```

---

## 15. Como preservar a conexao com o banco MySQL

O banco de dados MySQL nao e um arquivo local — fica no servidor de banco.
O que deve ser preservado e o arquivo `.env` com as credenciais de conexao.

- NUNCA sobrescreva o .env do servidor
- NUNCA exclua o .env do servidor
- Faca backup do .env antes de qualquer manutencao

Para testar a conexao MySQL:

```bash
# Via SSH no servidor
mysql -u digitalbordados_novo -p -h <MYSQL_HOST> digitalbordados_novo -e "SELECT 1"
```

---

## 16. Como preservar public/uploads

A pasta public/uploads/ contem os arquivos de produto que os clientes baixam.
Ela NAO deve ser apagada em nenhuma hipotese.

```bash
# Backup via SSH
tar -czf backup_uploads.tar.gz ~/digitalbordados/public/uploads/

# Verificar conteudo
ls -lh ~/digitalbordados/public/uploads/ | head -20
```

---

## 17. Como atualizar somente codigo com seguranca

Este e o deploy padrao — apenas a logica mudou, sem adicionar dependencias.

```bash
# 1. Na sua maquina local: build
npm run doctor:strict
npm run build

# 2. Envie apenas dist/
scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# 3. Reinicie
# Pelo painel DirectAdmin ou via SSH:
touch ~/digitalbordados/tmp/restart.txt

# 4. Teste
curl -I https://digitalbordados.com.br/api/health
```

---

## 18. Como atualizar somente conteudo pelo painel

Para mudancas simples de texto, imagens ou configuracoes:
- Use o painel admin em https://digitalbordados.com.br/admin
- Nao e necessario fazer deploy para atualizacoes de conteudo

---

## 19. Como evitar sobrescrever arquivos criticos

Regras para envio seguro:

- NUNCA envie para a pasta raiz sem saber o que esta substituindo
- SEMPRE envie especificamente a pasta dist/
- NUNCA envie node_modules/
- NUNCA sobrescreva .env
- NUNCA apague public/uploads/
- NUNCA apague uploads/arquivos/
- Use SFTP e navegue ate a pasta correta antes de enviar

---

## 20. Quando considerar VPS

Considere migrar para VPS quando:

- O site receber mais de 500 visitas simultaneas
- O build no servidor for necessario com frequencia
- Precisar de PM2, cron jobs ou servicos em background
- A hospedagem compartilhada comecar a gerar erros 503 frequentes
- Precisar de mais controle sobre Node.js, versoes e configuracoes

---

## Resumo Rapido — Cola para Deploy

```
=== NA SUA MAQUINA LOCAL ===

npm run doctor:strict
npm run build
npm run doctor:startup:strict

=== ENVIO DOS ARQUIVOS ===

scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# Se package.json mudou:
scp package.json package-lock.json usuario@digitalbordados.com.br:~/digitalbordados/

=== NO SERVIDOR (SSH) ===

cd ~/digitalbordados

# Se package.json mudou:
npm install --omit=dev

# Reiniciar:
touch tmp/restart.txt

=== VERIFICACAO ===

curl -I https://digitalbordados.com.br/api/health
```

---

## Pasta a enviar, Startup File e reinicio

- Pasta a enviar:     dist/ (sempre), package.json (se mudar)
- Preservar SEMPRE:   public/uploads/ e uploads/arquivos/ (NUNCA apagar)
- Startup File:       app.js  (na raiz do projeto)
- Erro 503:           causado por dist/ ausente, Node errado ou .env faltando
- Reiniciar Passenger: touch tmp/restart.txt  ou pelo painel DirectAdmin
- Proximo deploy:     build local -> scp dist/ -> reiniciar -> testar /api/health

 = # Guia de Deploy — Digital Bordados no DirectAdmin com Passenger

> Sistema: Node.js 20 + Express + React/Vite + MySQL
> Ambiente: DirectAdmin / Phusion Passenger (hospedagem compartilhada)
> Última atualização: 2026-05-19

---

## AVISO IMPORTANTE

Este sistema usa **MySQL** como banco de dados oficial.
NAO existe SQLite em producao. O banco fica no servidor MySQL da hospedagem.
A pasta dist/ é gerada localmente e enviada ao servidor.
NUNCA rode `npm run build` no servidor compartilhado.

---

## 1. Estrutura correta da aplicacao no servidor

```
~/digitalbordados/           <- raiz da aplicacao no servidor
├── dist/                    <- BUILD GERADO LOCALMENTE (obrigatorio)
│   ├── server.cjs           <- startup do Passenger
│   ├── assets/              <- frontend compilado (JS, CSS)
│   └── ...
├── node_modules/            <- instalado no servidor via npm install
├── public/
│   └── uploads/             <- NUNCA APAGAR (imagens dos produtos)
├── uploads/
│   └── arquivos/            <- NUNCA APAGAR (arquivos ZIP/DST para download)
├── scripts/                 <- scripts auxiliares de build
├── package.json
├── package-lock.json
├── .npmrc
├── index.html
├── app.js                   <- entrypoint do Passenger
└── .env                     <- NUNCA APAGAR (credenciais de producao)
```

---

## 2. O que pode ser enviado ao servidor

| Arquivo/Pasta     | Enviar?    | Quando enviar                   |
|-------------------|------------|---------------------------------|
| dist/             | SEMPRE     | Em todo deploy                  |
| package.json      | SE MUDOU   | Quando adicionar dependencias   |
| package-lock.json | SE MUDOU   | Junto com package.json          |
| .npmrc            | SE MUDOU   | Mudancas de config npm          |
| app.js            | SE MUDOU   | Mudancas no entrypoint          |
| scripts/          | SE MUDOU   | Mudancas nos scripts de build   |
| index.html        | SE MUDOU   | Mudancas no HTML base           |

---

## 3. O que NUNCA deve ser apagado no servidor

| Arquivo/Pasta       | Motivo                                              |
|---------------------|-----------------------------------------------------|
| .env                | Credenciais de producao (MySQL, JWT, MP, PayPal)    |
| public/uploads/     | Imagens e capas dos produtos (exibidas no site)     |
| uploads/arquivos/   | Arquivos ZIP/DST para download pelos clientes       |
| node_modules/       | Dependencias instaladas (recriar e lento)           |

O banco de dados e MySQL — fica no servidor de banco da hospedagem.
Nao ha arquivo de banco para preservar no sistema de arquivos.

---

## 4. Como fazer backup antes de atualizar

### 4.1 Backup dos uploads (via SSH)

```bash
# No servidor, crie um backup da pasta de uploads
cd ~/digitalbordados
tar -czf backup_uploads_$(date +%Y%m%d).tar.gz public/uploads/
```

### 4.2 Backup do .env (via SSH ou SFTP)

```bash
cp .env .env.backup_$(date +%Y%m%d)
```

### 4.3 Backup do banco MySQL

Acesse o phpMyAdmin pelo painel DirectAdmin e exporte o banco
`digitalbordados_novo` como SQL antes de qualquer deploy.

---

## 5. Como gerar o build localmente (na sua maquina)

```bash
# Na sua maquina local
cd d:\www\digitalbordados\digitalbordados

# Confirme a versao do Node
node -v
# DEVE ser v20.x.x

# Instale dependencias (se necessario)
npm install

# Execute o diagnostico (valida ambiente)
npm run doctor:strict

# Gere o build completo
npm run build

# Confirme que dist/server.cjs foi gerado
npm run doctor:startup:strict
```

Resultado esperado na pasta dist/:
- dist/server.cjs      <- startup do Passenger
- dist/package.json    <- { "type": "commonjs" }
- dist/assets/         <- frontend compilado

---

## 6. Como gerar o build no servidor

NAO FACA ISSO em hospedagem compartilhada.
O build consome muita memoria e pode travar o servidor ou ser cancelado.
Sempre faca o build localmente e envie apenas a pasta dist/.

---

## 7. Como instalar dependencias no servidor

Esse passo so e necessario quando o package.json mudou.

```bash
# Via SSH no servidor
cd ~/digitalbordados
node -v
# Deve ser v20.x.x

npm install --omit=dev --no-audit --no-fund --prefer-offline

# Se ocorrer erro EAGAIN (falta de recursos):
npm config set jobs 1
npm install --omit=dev --no-audit --no-fund --prefer-offline
```

---

## 8. Como configurar Node.js 20 no DirectAdmin

1. Acesse o painel do DirectAdmin
2. Procure "Configuracao Node.js" ou "Setup Node.js App"
3. Selecione a versao Node.js 20.x
4. Defina o diretorio da aplicacao: ~/digitalbordados
5. Salve as configuracoes

---

## 9. Qual Startup File usar no Passenger

```
Startup File: app.js
```

O arquivo `app.js` na raiz do projeto e o entrypoint do Passenger.
Ele carrega `dist/server.cjs` internamente.

NAO configure `dist/server.cjs` diretamente como Startup File —
use sempre o `app.js` da raiz.

---

## 10. Como configurar variaveis de ambiente

### Via painel DirectAdmin (recomendado)

1. Acesse "Configuracao Node.js" no DirectAdmin
2. Procure a secao de variaveis de ambiente
3. Adicione cada variavel separadamente

### Via SSH (alternativa)

```bash
cd ~/digitalbordados
nano .env
```

Variaveis obrigatorias:

```
MYSQL_HOST=<ip-do-servidor-mysql>
MYSQL_PORT=3306
MYSQL_DATABASE=digitalbordados_novo
MYSQL_USER=digitalbordados_novo
MYSQL_PASSWORD=<sua-senha>

JWT_SECRET=<chave-secreta-longa>
NODE_ENV=production
APP_URL=https://digitalbordados.com.br

MERCADOPAGO_ACCESS_TOKEN=<seu-token>

PAYPAL_MODE=sandbox
PAYPAL_SANDBOX_CLIENT_ID=
PAYPAL_SANDBOX_CLIENT_SECRET=
PAYPAL_BRL_USD_RATE=5.20
```

---

## 11. Como reiniciar a aplicacao

### Pelo painel DirectAdmin

1. Acesse "Configuracao Node.js"
2. Clique em "Reiniciar" ou "Restart"
3. Aguarde 10 a 15 segundos

### Via SSH (metodo Passenger)

```bash
mkdir -p ~/digitalbordados/tmp
touch ~/digitalbordados/tmp/restart.txt
```

---

## 12. Como testar /api/health

```bash
# Via SSH no servidor
curl -I https://digitalbordados.com.br/api/health

# Resposta esperada:
# HTTP/1.1 200 OK
```

Ou acesse diretamente no navegador:
https://digitalbordados.com.br/api/health

---

## 13. Como identificar erro 503

O erro 503 indica que o Passenger nao conseguiu iniciar a aplicacao.

Causas mais comuns:

1. dist/server.cjs nao existe ou esta corrompido
2. Versao do Node incorreta (nao e 20.x)
3. node_modules/ ausente ou incompleto
4. .env ausente ou com variaveis faltando
5. Porta fixa hardcoded no codigo (deve usar process.env.PORT)
6. Erro de sintaxe no codigo compilado

Diagnostico via SSH:

```bash
cd ~/digitalbordados

# 1. dist/server.cjs existe?
ls -lh dist/server.cjs

# 2. Node na versao correta?
node -v

# 3. node_modules instalado?
ls node_modules/.package-lock.json

# 4. .env existe com variaveis?
grep MYSQL_HOST .env

# 5. Teste de startup manual
node dist/server.cjs
# Se mostrar erro, leia a mensagem
# Pressione Ctrl+C para parar
```

---

## 14. Como restaurar a pasta dist

```bash
# Na sua maquina local
cd d:\www\digitalbordados\digitalbordados
npm run build

# Enviar via SCP
scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# Reiniciar no servidor
touch ~/digitalbordados/tmp/restart.txt
```

---

## 15. Como preservar a conexao com o banco MySQL

O banco de dados MySQL nao e um arquivo local — fica no servidor de banco.
O que deve ser preservado e o arquivo `.env` com as credenciais de conexao.

- NUNCA sobrescreva o .env do servidor
- NUNCA exclua o .env do servidor
- Faca backup do .env antes de qualquer manutencao

Para testar a conexao MySQL:

```bash
# Via SSH no servidor
mysql -u digitalbordados_novo -p -h <MYSQL_HOST> digitalbordados_novo -e "SELECT 1"
```

---

## 16. Como preservar public/uploads

A pasta public/uploads/ contem os arquivos de produto que os clientes baixam.
Ela NAO deve ser apagada em nenhuma hipotese.

```bash
# Backup via SSH
tar -czf backup_uploads.tar.gz ~/digitalbordados/public/uploads/

# Verificar conteudo
ls -lh ~/digitalbordados/public/uploads/ | head -20
```

---

## 17. Como atualizar somente codigo com seguranca

Este e o deploy padrao — apenas a logica mudou, sem adicionar dependencias.

```bash
# 1. Na sua maquina local: build
npm run doctor:strict
npm run build

# 2. Envie apenas dist/
scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# 3. Reinicie
# Pelo painel DirectAdmin ou via SSH:
touch ~/digitalbordados/tmp/restart.txt

# 4. Teste
curl -I https://digitalbordados.com.br/api/health
```

---

## 18. Como atualizar somente conteudo pelo painel

Para mudancas simples de texto, imagens ou configuracoes:
- Use o painel admin em https://digitalbordados.com.br/admin
- Nao e necessario fazer deploy para atualizacoes de conteudo

---

## 19. Como evitar sobrescrever arquivos criticos

Regras para envio seguro:

- NUNCA envie para a pasta raiz sem saber o que esta substituindo
- SEMPRE envie especificamente a pasta dist/
- NUNCA envie node_modules/
- NUNCA sobrescreva .env
- NUNCA apague public/uploads/
- NUNCA apague uploads/arquivos/
- Use SFTP e navegue ate a pasta correta antes de enviar

---

## 20. Quando considerar VPS

Considere migrar para VPS quando:

- O site receber mais de 500 visitas simultaneas
- O build no servidor for necessario com frequencia
- Precisar de PM2, cron jobs ou servicos em background
- A hospedagem compartilhada comecar a gerar erros 503 frequentes
- Precisar de mais controle sobre Node.js, versoes e configuracoes

---

## Resumo Rapido — Cola para Deploy

```
=== NA SUA MAQUINA LOCAL ===

npm run doctor:strict
npm run build
npm run doctor:startup:strict

=== ENVIO DOS ARQUIVOS ===

scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# Se package.json mudou:
scp package.json package-lock.json usuario@digitalbordados.com.br:~/digitalbordados/

=== NO SERVIDOR (SSH) ===

cd ~/digitalbordados

# Se package.json mudou:
npm install --omit=dev

# Reiniciar:
touch tmp/restart.txt

=== VERIFICACAO ===

curl -I https://digitalbordados.com.br/api/health
```

---

## Pasta a enviar, Startup File e reinicio

- Pasta a enviar:     dist/ (sempre), package.json (se mudar)
- Preservar SEMPRE:   public/uploads/ e uploads/arquivos/ (NUNCA apagar)
- Startup File:       app.js  (na raiz do projeto)
- Erro 503:           causado por dist/ ausente, Node errado ou .env faltando
- Reiniciar Passenger: touch tmp/restart.txt  ou pelo painel DirectAdmin
- Proximo deploy:     build local -> scp dist/ -> reiniciar -> testar /api/health

 -replace '(## 16\. Como preservar public/uploads\r?\n\r?\nA pasta public/uploads/ contem os arquivos de produto que os clientes baixam\.\r?\nEla NAO deve ser apagada em nenhuma hipotese\.\r?\n\r?\n`ash\r?\n# Backup via SSH\r?\ntar -czf backup_uploads\.tar\.gz ~/digitalbordados/public/uploads/\r?\n\r?\n# Verificar conteudo\r?\nls -lh ~/digitalbordados/public/uploads/ \| head -20\r?\n`)', 


### 4.2 Backup do .env (via SSH ou SFTP)

```bash
cp .env .env.backup_$(date +%Y%m%d)
```

### 4.3 Backup do banco MySQL

Acesse o phpMyAdmin pelo painel DirectAdmin e exporte o banco
`digitalbordados_novo` como SQL antes de qualquer deploy.

---

## 5. Como gerar o build localmente (na sua maquina)

```bash
# Na sua maquina local
cd d:\www\digitalbordados\digitalbordados

# Confirme a versao do Node
node -v
# DEVE ser v20.x.x

# Instale dependencias (se necessario)
npm install

# Execute o diagnostico (valida ambiente)
npm run doctor:strict

# Gere o build completo
npm run build

# Confirme que dist/server.cjs foi gerado
npm run doctor:startup:strict
```

Resultado esperado na pasta dist/:
- dist/server.cjs      <- startup do Passenger
- dist/package.json    <- { "type": "commonjs" }
- dist/assets/         <- frontend compilado

---

## 6. Como gerar o build no servidor

NAO FACA ISSO em hospedagem compartilhada.
O build consome muita memoria e pode travar o servidor ou ser cancelado.
Sempre faca o build localmente e envie apenas a pasta dist/.

---

## 7. Como instalar dependencias no servidor

Esse passo so e necessario quando o package.json mudou.

```bash
# Via SSH no servidor
cd ~/digitalbordados
node -v
# Deve ser v20.x.x

npm install --omit=dev --no-audit --no-fund --prefer-offline

# Se ocorrer erro EAGAIN (falta de recursos):
npm config set jobs 1
npm install --omit=dev --no-audit --no-fund --prefer-offline
```

---

## 8. Como configurar Node.js 20 no DirectAdmin

1. Acesse o painel do DirectAdmin
2. Procure "Configuracao Node.js" ou "Setup Node.js App"
3. Selecione a versao Node.js 20.x
4. Defina o diretorio da aplicacao: ~/digitalbordados
5. Salve as configuracoes

---

## 9. Qual Startup File usar no Passenger

```
Startup File: app.js
```

O arquivo `app.js` na raiz do projeto e o entrypoint do Passenger.
Ele carrega `dist/server.cjs` internamente.

NAO configure `dist/server.cjs` diretamente como Startup File —
use sempre o `app.js` da raiz.

---

## 10. Como configurar variaveis de ambiente

### Via painel DirectAdmin (recomendado)

1. Acesse "Configuracao Node.js" no DirectAdmin
2. Procure a secao de variaveis de ambiente
3. Adicione cada variavel separadamente

### Via SSH (alternativa)

```bash
cd ~/digitalbordados
nano .env
```

Variaveis obrigatorias:

```
MYSQL_HOST=<ip-do-servidor-mysql>
MYSQL_PORT=3306
MYSQL_DATABASE=digitalbordados_novo
MYSQL_USER=digitalbordados_novo
MYSQL_PASSWORD=<sua-senha>

JWT_SECRET=<chave-secreta-longa>
NODE_ENV=production
APP_URL=https://digitalbordados.com.br

MERCADOPAGO_ACCESS_TOKEN=<seu-token>

PAYPAL_MODE=sandbox
PAYPAL_SANDBOX_CLIENT_ID=
PAYPAL_SANDBOX_CLIENT_SECRET=
PAYPAL_BRL_USD_RATE=5.20
```

---

## 11. Como reiniciar a aplicacao

### Pelo painel DirectAdmin

1. Acesse "Configuracao Node.js"
2. Clique em "Reiniciar" ou "Restart"
3. Aguarde 10 a 15 segundos

### Via SSH (metodo Passenger)

```bash
mkdir -p ~/digitalbordados/tmp
touch ~/digitalbordados/tmp/restart.txt
```

---

## 12. Como testar /api/health

```bash
# Via SSH no servidor
curl -I https://digitalbordados.com.br/api/health

# Resposta esperada:
# HTTP/1.1 200 OK
```

Ou acesse diretamente no navegador:
https://digitalbordados.com.br/api/health

---

## 13. Como identificar erro 503

O erro 503 indica que o Passenger nao conseguiu iniciar a aplicacao.

Causas mais comuns:

1. dist/server.cjs nao existe ou esta corrompido
2. Versao do Node incorreta (nao e 20.x)
3. node_modules/ ausente ou incompleto
4. .env ausente ou com variaveis faltando
5. Porta fixa hardcoded no codigo (deve usar process.env.PORT)
6. Erro de sintaxe no codigo compilado

Diagnostico via SSH:

```bash
cd ~/digitalbordados

# 1. dist/server.cjs existe?
ls -lh dist/server.cjs

# 2. Node na versao correta?
node -v

# 3. node_modules instalado?
ls node_modules/.package-lock.json

# 4. .env existe com variaveis?
grep MYSQL_HOST .env

# 5. Teste de startup manual
node dist/server.cjs
# Se mostrar erro, leia a mensagem
# Pressione Ctrl+C para parar
```

---

## 14. Como restaurar a pasta dist

```bash
# Na sua maquina local
cd d:\www\digitalbordados\digitalbordados
npm run build

# Enviar via SCP
scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# Reiniciar no servidor
touch ~/digitalbordados/tmp/restart.txt
```

---

## 15. Como preservar a conexao com o banco MySQL

O banco de dados MySQL nao e um arquivo local — fica no servidor de banco.
O que deve ser preservado e o arquivo `.env` com as credenciais de conexao.

- NUNCA sobrescreva o .env do servidor
- NUNCA exclua o .env do servidor
- Faca backup do .env antes de qualquer manutencao

Para testar a conexao MySQL:

```bash
# Via SSH no servidor
mysql -u digitalbordados_novo -p -h <MYSQL_HOST> digitalbordados_novo -e "SELECT 1"
```

---

## 16. Como preservar public/uploads

A pasta public/uploads/ contem os arquivos de produto que os clientes baixam.
Ela NAO deve ser apagada em nenhuma hipotese.

```bash
# Backup via SSH
tar -czf backup_uploads.tar.gz ~/digitalbordados/public/uploads/

# Verificar conteudo
ls -lh ~/digitalbordados/public/uploads/ | head -20
```

---

## 17. Como atualizar somente codigo com seguranca

Este e o deploy padrao — apenas a logica mudou, sem adicionar dependencias.

```bash
# 1. Na sua maquina local: build
npm run doctor:strict
npm run build

# 2. Envie apenas dist/
scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# 3. Reinicie
# Pelo painel DirectAdmin ou via SSH:
touch ~/digitalbordados/tmp/restart.txt

# 4. Teste
curl -I https://digitalbordados.com.br/api/health
```

---

## 18. Como atualizar somente conteudo pelo painel

Para mudancas simples de texto, imagens ou configuracoes:
- Use o painel admin em https://digitalbordados.com.br/admin
- Nao e necessario fazer deploy para atualizacoes de conteudo

---

## 19. Como evitar sobrescrever arquivos criticos

Regras para envio seguro:

- NUNCA envie para a pasta raiz sem saber o que esta substituindo
- SEMPRE envie especificamente a pasta dist/
- NUNCA envie node_modules/
- NUNCA sobrescreva .env
- NUNCA apague public/uploads/
- NUNCA apague uploads/arquivos/
- Use SFTP e navegue ate a pasta correta antes de enviar

---

## 20. Quando considerar VPS

Considere migrar para VPS quando:

- O site receber mais de 500 visitas simultaneas
- O build no servidor for necessario com frequencia
- Precisar de PM2, cron jobs ou servicos em background
- A hospedagem compartilhada comecar a gerar erros 503 frequentes
- Precisar de mais controle sobre Node.js, versoes e configuracoes

---

## Resumo Rapido — Cola para Deploy

```
=== NA SUA MAQUINA LOCAL ===

npm run doctor:strict
npm run build
npm run doctor:startup:strict

=== ENVIO DOS ARQUIVOS ===

scp -r dist/ usuario@digitalbordados.com.br:~/digitalbordados/dist/

# Se package.json mudou:
scp package.json package-lock.json usuario@digitalbordados.com.br:~/digitalbordados/

=== NO SERVIDOR (SSH) ===

cd ~/digitalbordados

# Se package.json mudou:
npm install --omit=dev

# Reiniciar:
touch tmp/restart.txt

=== VERIFICACAO ===

curl -I https://digitalbordados.com.br/api/health
```

---

## Pasta a enviar, Startup File e reinicio

- Pasta a enviar:     dist/ (sempre), package.json (se mudar)
- Preservar SEMPRE:   public/uploads/ e uploads/arquivos/ (NUNCA apagar)
- Startup File:       app.js  (na raiz do projeto)
- Erro 503:           causado por dist/ ausente, Node errado ou .env faltando
- Reiniciar Passenger: touch tmp/restart.txt  ou pelo painel DirectAdmin
- Proximo deploy:     build local -> scp dist/ -> reiniciar -> testar /api/health


