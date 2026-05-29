const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Iniciando diagnósticos da infraestrutura...\n');

  // Executa uma lista de comandos essenciais em sequência
  const commands = [
    'echo "=== PROCESSOS PM2 ===" && pm2 status',
    'echo "=== CONFIGURACAO PM2 DIGITALBORDADOS ===" && pm2 show digitalbordados || pm2 show 0',
    'echo "=== CONTEUDO NGINX-INCLUDES ===" && cat /etc/nginx/nginx-includes.conf 2>/dev/null || echo "Nao encontrado"',
    'echo "=== CONTEUDO DIRECTADMIN NGINX.CONF ===" && cat /usr/local/directadmin/data/users/digitalbordados/nginx.conf 2>/dev/null || echo "Nao encontrado"',
    'echo "=== NGINX CONFIGURATION DUMP ===" && nginx -T 2>/dev/null | grep -E "server_name|ssl_certificate|proxy_pass|listen" | head -n 120'
  ];

  conn.exec(commands.join(' && echo "" && '), (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    
    let output = '';
    stream.on('close', () => {
      fs.writeFileSync(path.join(__dirname, 'diagnose_results.txt'), output);
      console.log('\n--- Diagnóstico concluído com sucesso e gravado em temp/scratch/diagnose_results.txt ---');
      conn.end();
    }).on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk);
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('Erro SSH:', err.message);
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
