const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

// Fazer git pull e depois executar o script de diagnóstico
const commands = [
  'cd /home/digitalbordados/digitalbordados',
  'git pull',
  'node scripts/diagnose-missing-zips.cjs'
].join(' && ');

console.log('Iniciando conexão SSH para executar diagnóstico remoto...');

const conn = new Client();
conn.on('ready', () => {
  console.log('Conexão SSH estabelecida. Executando diagnóstico no servidor...');
  conn.exec(commands, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      console.log('\nDiagnóstico finalizado no servidor. Código de saída:', code);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
