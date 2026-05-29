const { Client } = require('ssh2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH conectado. Lendo os últimos erros do PM2...\n');

  conn.exec(`tail -n 100 /home/digitalbordados/.pm2/logs/digitalbordados-error.log`, (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    stream.on('close', (code) => {
      console.log(`\nCódigo de encerramento: ${code}`);
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
