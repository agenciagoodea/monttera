const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

// Comando para ler os últimos 200 logs do PM2 contendo a palavra Mobile Redirect Log
const command = 'pm2 logs digitalbordados --lines 150 --raw --nostream';

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code);
      console.log('\n--- OUTPUT ---');
      console.log(output || 'Nenhum log de redirecionamento encontrado.');
      console.log('--------------');
      conn.end();
    }).on('data', (data) => {
      output += data.toString();
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
