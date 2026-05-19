# Relatório de Backup de Produção — Digital Bordados

> Gerado em: 2026-05-19
> Tipo: Backup enxuto para reinstalação limpa no DirectAdmin

---

## Resultado das Validações Pré-Backup

| Verificação                          | Status |
|--------------------------------------|--------|
| dist/server.cjs existe               | OK     |
| dist/assets/ existe                  | OK     |
| app.js existe e carrega dist/        | OK     |
| package.json correto                 | OK     |
| npm start = node dist/server.cjs     | OK     |
| process.env.PORT utilizado           | OK     |
| Sem porta fixa hardcoded             | OK     |
| Sem Vite middleware em producao      | OK     |
| dist/package.json type=commonjs      | OK     |
| Compatível com Passenger             | OK     |

---

## O que foi INCLUÍDO no BACKUP_PRODUCAO.zip

| Arquivo/Pasta        | Motivo                                              |
|----------------------|-----------------------------------------------------|
| dist/                | Build compilado (frontend + backend)                |
| dist/server.cjs      | Entrypoint do Passenger (via app.js)                |
| dist/server.js       | Servidor backend compilado                          |
| dist/assets/         | Frontend React compilado (JS, CSS, fontes)          |
| dist/package.json    | Define type=commonjs para Node                      |
| app.js               | Startup File do Phusion Passenger                   |
| package.json         | Dependencias e scripts do sistema                   |
| package-lock.json    | Lock de versoes das dependencias                    |
| .npmrc               | Configuracoes do npm                                |
| .nvmrc               | Versao do Node (20)                                 |
| index.html           | HTML base da SPA                                    |
| scripts/             | Scripts auxiliares (doctor, build, deploy)          |
| public/uploads/      | 977 imagens dos produtos (164.7 MB)                 |
| uploads/arquivos/    | Placeholder (conteudo original deve vir do servidor)|
| .env.example         | Referencia de variaveis (NAO e o .env real)         |

### Tamanho final do ZIP
326.1 MB (sem node_modules, sem .git, sem logs, sem cache)

---

## O que foi EXCLUÍDO (nao incluir nunca)

| Excluído                   | Motivo                                              |
|----------------------------|-----------------------------------------------------|
| node_modules/              | Instalar no servidor via npm install                |
| .git/                      | Historico de versoes, desnecessario em producao     |
| server.ts                  | Codigo-fonte TypeScript, nao roda em producao       |
| src/                       | Codigo-fonte, substituido pelo dist/                |
| *.log / dev_run_*.log      | Logs de desenvolvimento                             |
| deploy-bundle.tar.gz       | Bundle antigo, substituido por este backup          |
| teste-conexao.js/.ts       | Scripts de teste de desenvolvimento                 |
| check_db.ts                | Script de diagnostico local                         |
| cookie.txt / cookie_*.txt  | Cookies de sessao de teste                          |
| login_response.json        | Dados de teste                                      |
| scratch/                   | Pasta de rascunhos                                  |
| migracao/                  | Scripts de migracao WooCommerce                     |
| metadata.json              | Metadado interno da ferramenta                      |
| vercel.json                | Configuracao da Vercel (nao usada em producao)      |
| tsconfig*.json             | Configuracoes TypeScript (apenas para build local)  |
| vite.config.ts             | Configuracao Vite (apenas para build local)         |
| .env                       | NAO incluido - deve ser configurado no servidor     |
| database.sqlite            | Removido - sistema usa MySQL                        |
| MANUAL_TECNICO_SISTEMA.md  | Documentacao interna (opcional incluir)             |
| DEPLOY_DIRECTADMIN.md      | Documentacao interna (opcional incluir)             |
| CHECKLIST_DEPLOY.md        | Documentacao interna (opcional incluir)             |

---

## Estrutura Final do Deploy no Servidor

```
~/digitalbordados/              <- raiz da aplicacao
├── dist/
│   ├── server.cjs              <- require('./server.js') - entrypoint
│   ├── server.js               <- backend compilado (322 KB)
│   ├── package.json            <- { "type": "commonjs" }
│   ├── index.html              <- HTML do frontend
│   ├── assets/                 <- JS, CSS, fontes compiladas
│   ├── src/                    <- arquivos auxiliares
│   └── uploads/                <- link para uploads do dist
├── public/
│   └── uploads/                <- imagens dos produtos (977 arquivos)
├── uploads/
│   └── arquivos/               <- RESTAURAR DO SERVIDOR ANTIGO
├── scripts/                    <- scripts auxiliares
├── node_modules/               <- instalar via npm install
├── app.js                      <- STARTUP FILE DO PASSENGER
├── package.json
├── package-lock.json
├── .npmrc
├── .nvmrc
├── index.html
└── .env                        <- RESTAURAR DO SERVIDOR ANTIGO
```

---

## Pastas Criticas Preservadas

| Pasta               | Arquivos  | Tamanho   | Status no ZIP          |
|---------------------|-----------|-----------|------------------------|
| public/uploads/     | 977       | 164.7 MB  | INCLUIDA no ZIP        |
| uploads/arquivos/   | (servidor)| (servidor)| PLACEHOLDER no ZIP     |

> ATENCAO: uploads/arquivos/ NAO existe localmente.
> O conteudo real esta NO SERVIDOR ANTIGO.
> OBRIGATORIO: fazer download desta pasta do servidor ANTES de apagar o diretorio antigo.

---

## Startup File correto

```
Startup File: app.js
```

Fluxo de execucao:
1. Passenger chama app.js
2. app.js faz: require('./dist/server.cjs')
3. dist/server.cjs faz: require('./server.js')
4. dist/server.js inicia o Express na porta process.env.PORT

---

## Como reinstalar no DirectAdmin

### 1. Baixar do servidor antigo (ANTES de apagar qualquer coisa)
```bash
# Via SFTP: baixar as pastas criticas
public/uploads/     -> salvar localmente
uploads/arquivos/   -> salvar localmente
.env                -> salvar localmente
```

### 2. Apagar o diretorio antigo
Pelo painel DirectAdmin ou FileManager:
- Apagar o conteudo de ~/digitalbordados/
- NAO apagar o diretorio raiz em si, apenas o conteudo

### 3. Subir o BACKUP_PRODUCAO.zip
- Upload via FileManager do DirectAdmin ou SFTP
- Extrair na pasta ~/digitalbordados/

### 4. Restaurar arquivos criticos
```bash
# Restaurar .env
cp /caminho/backup/.env ~/digitalbordados/.env

# Restaurar public/uploads/
cp -r /caminho/backup/public/uploads/* ~/digitalbordados/public/uploads/

# Restaurar uploads/arquivos/
cp -r /caminho/backup/uploads/arquivos/* ~/digitalbordados/uploads/arquivos/
```

### 5. Instalar dependencias
```bash
cd ~/digitalbordados
npm install --omit=dev --no-audit --no-fund --prefer-offline
```

### 6. Reiniciar Passenger
Pelo painel DirectAdmin -> Configuracao Node.js -> Reiniciar
Ou via SSH: touch ~/digitalbordados/tmp/restart.txt

### 7. Validar
```bash
curl -I https://digitalbordados.com.br/api/health
# Esperado: HTTP/1.1 200 OK
```

---

## Como evitar erro 503 apos reinstalacao

Causas e solucoes:

| Causa                        | Solucao                                    |
|------------------------------|--------------------------------------------|
| dist/server.cjs ausente      | Extrair ZIP novamente                      |
| .env ausente ou incompleto   | Restaurar .env do backup                   |
| node_modules ausente         | Rodar npm install --omit=dev               |
| Versao Node errada           | Configurar Node 20 no DirectAdmin          |
| Passenger nao reiniciado     | Reiniciar pelo painel ou restart.txt       |
| uploads/arquivos ausente     | Restaurar pasta do servidor antigo         |
