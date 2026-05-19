# Checklist de Reinstalação Limpa — Digital Bordados

> Use este checklist para reinstalação completa no DirectAdmin.
> Execute CADA passo em ordem. Não pule nenhum.

---

## ALERTA CRITICO

Antes de apagar QUALQUER coisa no servidor, você DEVE ter em mãos:
- Backup de public/uploads/
- Backup de uploads/arquivos/
- Backup do .env do servidor

Sem esses três itens, NAO continue.

---

## FASE 1 — Backup do servidor antigo

### Passo 1 — Baixar public/uploads/ do servidor

Via SFTP (FileZilla, WinSCP ou similar):
- Conectar no servidor
- Navegar ate ~/digitalbordados/public/uploads/
- Baixar a pasta inteira para seu computador
- Confirmar que os arquivos foram baixados com sucesso
- Tamanho esperado: ~165 MB / 977+ arquivos

- [ ] public/uploads/ baixado e verificado localmente

---

### Passo 2 — Baixar uploads/arquivos/ do servidor

Via SFTP:
- Navegar ate ~/digitalbordados/uploads/arquivos/
- Baixar a pasta inteira para seu computador
- Confirmar que os arquivos foram baixados (ZIP, DST, etc.)

- [ ] uploads/arquivos/ baixado e verificado localmente

---

### Passo 3 — Baixar o .env do servidor

Via SFTP:
- Navegar ate ~/digitalbordados/.env
- Baixar o arquivo .env para seu computador
- Abrir e confirmar que contem:
  - MYSQL_HOST
  - MYSQL_PASSWORD
  - JWT_SECRET
  - MERCADOPAGO_ACCESS_TOKEN

- [ ] .env baixado e verificado localmente

---

### Passo 4 — Fazer backup do banco MySQL

Via phpMyAdmin no painel DirectAdmin:
- Acessar phpMyAdmin
- Selecionar banco: digitalbordados_novo
- Exportar -> Formato SQL -> Executar
- Salvar o arquivo .sql localmente

- [ ] Backup do banco MySQL salvo localmente

---

## FASE 2 — Limpeza do servidor

### Passo 5 — Apagar o conteudo do diretorio antigo

Via FileManager do DirectAdmin ou SFTP:
- Selecionar TODO o conteudo de ~/digitalbordados/
- Apagar (NAO apagar o diretorio raiz, apenas o conteudo)
- Confirmar que a pasta esta vazia

ATENCAO: Voce JA fez o backup de tudo no Passo 1, 2 e 3.

- [ ] Diretorio ~/digitalbordados/ esvaziado

---

## FASE 3 — Upload do novo pacote

### Passo 6 — Subir o BACKUP_PRODUCAO.zip

Via FileManager do DirectAdmin:
- Acessar o gerenciador de arquivos
- Navegar ate ~/digitalbordados/
- Fazer upload do arquivo BACKUP_PRODUCAO.zip
- Aguardar conclusao do upload

Ou via SCP:
  scp BACKUP_PRODUCAO.zip usuario@digitalbordados.com.br:~/digitalbordados/

- [ ] BACKUP_PRODUCAO.zip enviado ao servidor

---

### Passo 7 — Extrair os arquivos

Via FileManager do DirectAdmin:
- Clicar com botao direito em BACKUP_PRODUCAO.zip
- Selecionar Extrair
- Extrair na propria pasta ~/digitalbordados/
- Confirmar que os arquivos foram extraidos

Ou via SSH:
  cd ~/digitalbordados
  unzip BACKUP_PRODUCAO.zip

- [ ] Arquivos extraidos em ~/digitalbordados/

---

### Passo 8 — Verificar estrutura pos-extracao

Via SSH:
  ls ~/digitalbordados/

Deve existir:
  app.js
  dist/
  package.json
  package-lock.json
  public/
  scripts/

- [ ] Estrutura verificada e correta

---

## FASE 4 — Restauracao dos dados criticos

### Passo 9 — Restaurar o .env

Via SFTP:
- Enviar o .env salvo no Passo 3 para ~/digitalbordados/.env
- NAO usar o .env.example que veio no ZIP

Via SSH:
  nano ~/digitalbordados/.env
  # Colar o conteudo do .env salvo

- [ ] .env restaurado com todas as credenciais

---

### Passo 10 — Restaurar public/uploads/

Via SFTP:
- Enviar o conteudo da pasta public/uploads/ salvo no Passo 1
- Destino: ~/digitalbordados/public/uploads/
- Aguardar upload completo (pode demorar por ser ~165 MB)

Via SSH (se tiver o backup em tar.gz no servidor):
  tar -xzf backup_uploads.tar.gz -C ~/digitalbordados/

- [ ] public/uploads/ restaurado e verificado
- [ ] Confirmar: ls ~/digitalbordados/public/uploads/ (deve listar arquivos)

---

### Passo 11 — Restaurar uploads/arquivos/

Via SFTP:
- Enviar o conteudo da pasta uploads/arquivos/ salvo no Passo 2
- Destino: ~/digitalbordados/uploads/arquivos/
- Remover o arquivo LEIA-ME.txt do placeholder se existir

- [ ] uploads/arquivos/ restaurado e verificado
- [ ] Confirmar: ls ~/digitalbordados/uploads/arquivos/ (deve listar arquivos)

---

## FASE 5 — Instalacao e inicializacao

### Passo 12 — Instalar dependencias

Via SSH:
  cd ~/digitalbordados
  node -v
  # DEVE mostrar v20.x.x

  npm install --omit=dev --no-audit --no-fund --prefer-offline

  # Se der erro EAGAIN:
  npm config set jobs 1
  npm install --omit=dev --no-audit --no-fund --prefer-offline

- [ ] node -v retorna v20.x.x
- [ ] npm install concluido sem erros fatais

---

### Passo 13 — Configurar Startup File no DirectAdmin

No painel DirectAdmin -> Configuracao Node.js:
- Application root: ~/digitalbordados
- Startup File: app.js
- Node.js version: 20.x

- [ ] Startup File configurado como app.js
- [ ] Node.js 20 selecionado

---

### Passo 14 — Reiniciar o Passenger

Pelo painel DirectAdmin:
- Configuracao Node.js -> Reiniciar

Ou via SSH:
  mkdir -p ~/digitalbordados/tmp
  touch ~/digitalbordados/tmp/restart.txt

- [ ] Passenger reiniciado
- [ ] Aguardado 15 segundos

---

## FASE 6 — Testes obrigatorios

### Passo 15 — Testar /api/health

  curl -I https://digitalbordados.com.br/api/health
  # Esperado: HTTP/1.1 200 OK

Ou acessar no navegador: https://digitalbordados.com.br/api/health

- [ ] /api/health retorna 200 OK

---

### Passo 16 — Testar carregamento do site

  https://digitalbordados.com.br

- [ ] Site carrega sem erro 503
- [ ] Layout aparece corretamente
- [ ] Produtos listados na home

---

### Passo 17 — Testar login de cliente

- [ ] Login de cliente funciona
- [ ] Area "Minha Conta" carrega

---

### Passo 18 — Testar painel admin

  https://digitalbordados.com.br/admin

- [ ] Login admin funciona
- [ ] Dashboard admin carrega
- [ ] Produtos listados no admin

---

### Passo 19 — Testar checkout

- [ ] Adicionar produto ao carrinho
- [ ] Ir para checkout
- [ ] Redirecionamento para Mercado Pago funciona

---

### Passo 20 — Testar downloads

- [ ] Acessar "Minha Conta" como cliente com pedido pago
- [ ] Arquivo disponivel para download
- [ ] Download inicia corretamente

---

## CHECKLIST FINAL — Confirmacao pos-instalacao

- [ ] Site online sem erro 503
- [ ] /api/health retorna 200
- [ ] Login funcionando
- [ ] Admin acessivel
- [ ] Produtos com imagens (public/uploads/ OK)
- [ ] Downloads funcionando (uploads/arquivos/ OK)
- [ ] Checkout redirecionando para Mercado Pago
- [ ] .env com todas as credenciais corretas
- [ ] Node.js 20 ativo
- [ ] app.js como Startup File
- [ ] Apagar BACKUP_PRODUCAO.zip do servidor apos extrair

---

## Referencia rapida

| Item                  | Valor                              |
|-----------------------|------------------------------------|
| Startup File          | app.js                             |
| Comando post-deploy   | npm install --omit=dev             |
| Reiniciar Passenger   | touch tmp/restart.txt              |
| Verificar saude       | GET /api/health -> 200 OK          |
| Banco de dados        | MySQL (digitalbordados_novo)       |
| Imagens dos produtos  | public/uploads/ (977+ arquivos)    |
| Arquivos de download  | uploads/arquivos/ (do servidor)    |
| .env                  | NAO esta no ZIP - restaurar manualmente |
