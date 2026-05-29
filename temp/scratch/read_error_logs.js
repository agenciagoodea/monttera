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
  console.log('SSH conectado. Listando logs do PM2...\n');

  // Lista os arquivos de log de erros e output
  conn.exec(`ls -la /home/digitalbordados/.pm2/logs/`, (err, stream) => {
    if (err) { console.error('Exec err:', err); conn.end(); return; }
    stream.on('close', () => {
      // Agora vamos ler o log de erros
      console.log('\n--- LENDO LOG DE ERROS ---\n');
      conn.exec(`tail -n 100 /home/digitalbordados/.pm2/logs/digitalbordados-error.log || tail -n 100 /home/digitalbordados/.pm2/logs/digitalbordados-err.log`, (err2, stream2) => {
        if (err2) { console.error('Exec error err:', err2); conn.end(); return; }
        stream2.on('close', () => {
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data.toString());
        }).stderr.on('data', (data) => {
          process.stderr.write(data.toString());
        });
      });
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('Erro SSH:', err.message);
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
