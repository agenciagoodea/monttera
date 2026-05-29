const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Buscando logs de erros do domínio...\n');

  const commands = [
    'echo "=== LOGS NGINX DE DOMINIO ===" && tail -n 50 /var/log/nginx/domains/digitalbordados.com.br.error.log 2>&1 || echo "Nao acessivel"',
    'echo "=== LOGS APACHE DE DOMINIO ===" && tail -n 50 /var/log/httpd/domains/digitalbordados.com.br.error.log 2>&1 || echo "Nao acessivel"',
    'echo "=== LOGS DE DOMINIO NA HOME ===" && ls -la /home/digitalbordados/domains/digitalbordados.com.br/logs/ 2>&1 || echo "Nao acessivel"',
    'echo "=== CONTEUDO DO DIRECTORY TMP ===" && ls -la /home/digitalbordados/digitalbordados/tmp/ 2>&1 || echo "Nao acessivel"'
  ];

  conn.exec(commands.join(' && echo "" && '), (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    
    stream.on('close', () => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('Erro SSH:', err.message);
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
