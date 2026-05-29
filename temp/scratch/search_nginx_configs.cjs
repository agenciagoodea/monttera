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
  console.log('SSH conectado. Buscando configs do Nginx...\n');

  const commands = [
    'echo "=== BUSCA POR 3000 EM /etc/nginx/ ===" && grep -rn "3000" /etc/nginx/ 2>/dev/null || echo "Nao encontrado"',
    'echo "=== BUSCA POR nginx-includes EM /etc/nginx/ ===" && grep -rn "nginx-includes" /etc/nginx/ 2>/dev/null || echo "Nao encontrado"',
    'echo "=== ARQUIVOS EM /etc/nginx/conf.d/ ===" && ls -la /etc/nginx/conf.d/ 2>/dev/null || echo "Nao encontrado"',
    'echo "=== BUSCA POR proxy_pass EM /usr/local/directadmin/data/users/digitalbordados/ ===" && grep -rn "proxy_pass" /usr/local/directadmin/data/users/digitalbordados/ 2>/dev/null || echo "Nao encontrado"'
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
