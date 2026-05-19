# Checklist de Deploy - Digital Bordados no DirectAdmin

> Use este checklist em todo deploy antes de enviar arquivos para o servidor.
> Sistema: Node.js 20 + MySQL (NAO usa SQLite)

---

## PASTAS CRITICAS — NUNCA APAGAR

```
public/uploads/          <- imagens dos produtos (capas, galeria)
uploads/arquivos/        <- arquivos ZIP/DST para download pelos clientes
```

Essas duas pastas sao IRREVERSIVEIS se apagadas.
NAO ha backup automatico delas. Preserve-as em todo e qualquer deploy.

---

## PRE-DEPLOY — Antes de comecar

- [ ] Fazer backup do .env do servidor
      (via SSH: cp .env .env.backup_$(date +%Y%m%d))
- [ ] Fazer backup de public/uploads/
      (via SSH: tar -czf backup_uploads_$(date +%Y%m%d).tar.gz public/uploads/)
- [ ] Fazer backup de uploads/arquivos/
      (via SSH: tar -czf backup_arquivos_$(date +%Y%m%d).tar.gz uploads/arquivos/)
- [ ] Fazer backup do banco MySQL via phpMyAdmin (exportar digitalbordados_novo)
- [ ] Confirmar que esta na branch correta localmente (git status)
- [ ] Confirmar que o Node.js local e v20.x.x  (node -v)

---

## BUILD — Na sua maquina local

- [ ] Rodar: npm install  (garantir dependencias atualizadas)
- [ ] Rodar: npm run doctor:strict  (nenhum erro deve aparecer)
- [ ] Rodar: npm run build  (gera a pasta dist/)
- [ ] Confirmar que dist/server.cjs existe
- [ ] Confirmar que dist/assets/ existe (frontend compilado)
- [ ] Rodar: npm run doctor:startup:strict  (valida o build gerado)

---

## ENVIO — Enviando arquivos para o servidor

- [ ] Conectar via SFTP (NAO via FTP simples)
- [ ] Navegar ate ~/digitalbordados/ no servidor
- [ ] Enviar a pasta dist/ completa (substituindo a antiga)
- [ ] Se package.json mudou: enviar package.json e package-lock.json
- [ ] VERIFICAR que public/uploads/ continua intacta apos o envio
- [ ] VERIFICAR que uploads/arquivos/ continua intacta apos o envio

---

## POS-ENVIO — No servidor via SSH

- [ ] Se package.json mudou: rodar npm install --omit=dev no servidor
- [ ] Confirmar que as variaveis de ambiente estao corretas no .env
- [ ] Confirmar que public/uploads/ ainda existe e tem arquivos:
      ls -lh ~/digitalbordados/public/uploads/ | head -10
- [ ] Confirmar que uploads/arquivos/ ainda existe e tem arquivos:
      ls -lh ~/digitalbordados/uploads/arquivos/ | head -10
- [ ] Reiniciar o Passenger (painel DirectAdmin ou: touch tmp/restart.txt)
- [ ] Aguardar 15 segundos antes de testar

---

## TESTES — Verificacao pos-deploy

- [ ] Testar /api/health -> deve retornar HTTP 200
- [ ] Testar carregamento do site (https://digitalbordados.com.br)
- [ ] Testar login de cliente
- [ ] Testar login de admin
- [ ] Testar painel admin (/admin)
- [ ] Testar listagem de produtos
- [ ] Testar imagens de produto (dependem de public/uploads/)
- [ ] Testar carrinho
- [ ] Testar checkout (ate o redirecionamento para pagamento)
- [ ] Testar area "Minha Conta" do cliente
- [ ] Testar download de arquivo (depende de uploads/arquivos/)

---

## REGRAS ABSOLUTAS — Nunca ignorar

- NAO apagar public/uploads/          (imagens dos produtos)
- NAO apagar uploads/arquivos/        (arquivos para download)
- NAO apagar .env do servidor
- NAO enviar node_modules/ do seu PC para o servidor
- NAO rodar npm run build no servidor compartilhado
- NAO sobrescrever .env do servidor com o .env local
- NAO alterar Mercado Pago sem necessidade
- NAO alterar fluxo de login, checkout ou downloads sem necessidade
- Toda alteracao deve ser segura e reversivel

---

## EM CASO DE ERRO 503 — Recuperacao rapida

1. Verificar se dist/server.cjs existe no servidor
2. Verificar versao do Node: node -v (deve ser 20.x)
3. Verificar node_modules: ls node_modules/.package-lock.json
4. Verificar .env: grep MYSQL_HOST .env
5. Testar startup manual: node dist/server.cjs
6. Se necessario: refazer build local e reenviar dist/

---

## EM CASO DE DOWNLOADS QUEBRADOS — Recuperacao rapida

1. Verificar se uploads/arquivos/ existe:
   ls -lh ~/digitalbordados/uploads/arquivos/ | head -10

2. Verificar permissoes:
   chmod -R 755 ~/digitalbordados/uploads/
   chmod -R 755 ~/digitalbordados/public/uploads/

3. Restaurar do backup:
   tar -xzf backup_arquivos_YYYYMMDD.tar.gz

---

## Referencia rapida

| Item                       | Valor                               |
|----------------------------|-------------------------------------|
| Startup File               | app.js                              |
| Node.js versao             | 20.x.x                              |
| Banco de dados             | MySQL (digitalbordados_novo)        |
| Imagens dos produtos       | public/uploads/                     |
| Arquivos para download     | uploads/arquivos/                   |
| URL de saude               | /api/health                         |
| Reiniciar Passenger        | touch tmp/restart.txt               |
