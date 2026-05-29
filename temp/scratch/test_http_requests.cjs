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
  console.log('SSH conectado. Testando requisições HTTP locais no servidor...\n');

  const commands = [
    'echo "=== TESTE CURL PORTA 3000 ===" && curl -I http://127.0.0.1:3000/api/health 2>&1 || true',
    'echo "=== TESTE CURL DOMINIO PRINCIPAL ===" && curl -IL https://digitalbordados.com.br/ 2>&1 | head -n 30 || true',
    'echo "=== TESTE CURL SUBDOMINIO MOBILE ===" && curl -IL https://m.digitalbordados.com.br/ 2>&1 | head -n 30 || true'
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
