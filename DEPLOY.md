# Runbook de Operação — digitalbordados.com.br

## Visão geral

| Item | Valor |
|---|---|
| Servidor | VPS AlmaLinux — `177.136.229.86` |
| Domínio | `digitalbordados.com.br` |
| Caminho da aplicação | `/home/digitalbordados/digitalbordados` |
| Processo PM2 | `digitalbordados` |
| Porta interna | `3000` |
| Entry point | `dist/server.cjs` |
| Banco de dados | MariaDB local — `digitalbordados_novo` |
| Nginx vhost customizado | `/etc/nginx/nginx-includes.conf` |

---

## 1. Deploy de atualização (fluxo completo)

```bash
# 1. Entrar no diretório da aplicação
cd /home/digitalbordados/digitalbordados

# 2. Baixar atualizações do repositório
git pull

# 3. Instalar dependências novas (se houver mudança em package.json)
npm install --omit=dev

# 4. Gerar novo build (client + server)
npm run build

# 5. Verificar se o build foi gerado corretamente
ls -lh dist/server.cjs

# 6. Reiniciar o processo sem downtime
pm2 reload digitalbordados

# 7. Confirmar que voltou online
pm2 status
```

> **Dica**: o comando `npm run prepare:deploy` executa doctor + build em sequência e pode ser usado antes do passo 6 para validar antes de reiniciar.

---

## 2. Verificação rápida de saúde

```bash
# Status do processo
pm2 status

# App respondendo localmente
curl -I http://127.0.0.1:3000

# App respondendo via HTTPS público
curl -I https://digitalbordados.com.br

# Teste Nginx
nginx -t
```

Tudo saudável quando:
- PM2 mostra `status: online` e `↺ 0` (zero restarts recentes)
- Curl retorna `200 OK`
- `nginx -t` mostra `syntax is ok`

---

## 3. Gerenciar o processo PM2

```bash
# Ver status de todos os processos
pm2 status

# Recarregar sem downtime (prefira este em produção)
pm2 reload digitalbordados

# Reiniciar forçado (use só se reload não resolver)
pm2 restart digitalbordados

# Parar
pm2 stop digitalbordados

# Iniciar (se estiver parado)
pm2 start digitalbordados

# Salvar lista de processos (preserva entre reboots)
pm2 save
```

---

## 4. Logs

```bash
# Logs em tempo real (stdout + stderr juntos)
pm2 logs digitalbordados

# Últimas 100 linhas
pm2 logs digitalbordados --lines 100

# Apenas erros
pm2 logs digitalbordados --err --lines 100

# Logs do Nginx (acesso)
tail -f /var/log/nginx/domains/digitalbordados.com.br.log

# Logs do Nginx (erros)
tail -f /var/log/nginx/domains/digitalbordados.com.br.error.log

# Arquivos de log diretos do PM2
tail -f /root/.pm2/logs/digitalbordados-out.log
tail -f /root/.pm2/logs/digitalbordados-error.log
```

---

## 5. Nginx

```bash
# Testar configuração
nginx -t

# Recarregar sem derrubar conexões
systemctl reload nginx

# Status do serviço
systemctl status nginx --no-pager

# Arquivo de configuração customizado (HTTP + HTTPS → Node.js)
cat /etc/nginx/nginx-includes.conf
```

> **Importante**: o arquivo `/etc/nginx/nginx-includes.conf` é o que faz o proxy do domínio para a porta 3000.
> O DirectAdmin gera automaticamente blocos conflitantes em `/usr/local/directadmin/data/users/digitalbordados/nginx.conf`,
> mas o `nginx-includes.conf` é carregado primeiro e tem prioridade — não altere essa ordem.

---

## 6. Banco de dados MariaDB

```bash
# Acessar o banco (substitua a senha conforme o .env)
mysql -u digitalbordados -p digitalbordados_novo

# Dentro do MySQL — listar tabelas
SHOW TABLES;

# Backup manual
mysqldump -u digitalbordados -p digitalbordados_novo > /root/backup_$(date +%Y%m%d_%H%M).sql

# Restaurar backup
mysql -u digitalbordados -p digitalbordados_novo < /root/backup_YYYYMMDD_HHMM.sql
```

---

## 7. Troubleshooting

### App retorna 500 pelo domínio mas funciona na porta 3000

```bash
# 1. Verificar logs de erro do Nginx
tail -n 50 /var/log/nginx/domains/digitalbordados.com.br.error.log

# 2. Testar proxy HTTP direto
curl -I http://177.136.229.86 -H "Host: digitalbordados.com.br"

# 3. Testar proxy HTTPS direto
curl -kI https://177.136.229.86 -H "Host: digitalbordados.com.br"

# 4. Se o proxy HTTPS der 500: verificar se nginx-includes.conf tem o bloco 443
grep "443" /etc/nginx/nginx-includes.conf

# 5. Recarregar Nginx após qualquer correção
nginx -t && systemctl reload nginx
```

### PM2 em loop de restarts

```bash
# Ver erros recentes
pm2 logs digitalbordados --err --lines 50

# Testar o servidor manualmente (sem PM2)
cd /home/digitalbordados/digitalbordados
PORT=3000 timeout 30s node dist/server.cjs

# Se o erro for no .env, verificar variáveis (sem expor valores)
grep -v "SECRET\|PASSWORD\|PASS\|KEY\|TOKEN" .env | head -20
```

### Após reboot do servidor

O PM2 pode não reiniciar automaticamente se o serviço não estiver habilitado:

```bash
# Verificar se PM2 está configurado para iniciar no boot
pm2 startup
# (executar o comando que ele sugerir, se necessário)

pm2 save
pm2 status
```

---

## 8. SSL / Certificados

Os certificados são gerenciados pelo **DirectAdmin via Let's Encrypt** e renovados automaticamente.

Caminhos dos certificados (não editar manualmente):
- Cert: `/usr/local/directadmin/data/users/digitalbordados/domains/digitalbordados.com.br.cert.combined`
- Key: `/usr/local/directadmin/data/users/digitalbordados/domains/digitalbordados.com.br.key`

Verificar validade:
```bash
openssl x509 -in /usr/local/directadmin/data/users/digitalbordados/domains/digitalbordados.com.br.cert.combined \
  -noout -dates
```

---

## 9. Variáveis de ambiente

O arquivo `.env` fica em `/home/digitalbordados/digitalbordados/.env`.

- **Nunca commitar o `.env` no repositório.**
- Para ver as chaves configuradas (sem valores sensíveis):

```bash
grep -v "SECRET\|PASSWORD\|PASS\|KEY\|TOKEN" /home/digitalbordados/digitalbordados/.env
```

- Para editar:

```bash
nano /home/digitalbordados/digitalbordados/.env
# Após editar, reiniciar o processo:
pm2 reload digitalbordados
```

---

## 10. Referência rápida de comandos

| Ação | Comando |
|---|---|
| Ver status geral | `pm2 status` |
| Ver logs ao vivo | `pm2 logs digitalbordados` |
| Deploy de atualização | `git pull && npm install --omit=dev && npm run build && pm2 reload digitalbordados` |
| Reiniciar app | `pm2 reload digitalbordados` |
| Recarregar Nginx | `nginx -t && systemctl reload nginx` |
| Testar app local | `curl -I http://127.0.0.1:3000` |
| Testar domínio HTTPS | `curl -I https://digitalbordados.com.br` |
| Backup do banco | `mysqldump -u digitalbordados -p digitalbordados_novo > backup.sql` |
