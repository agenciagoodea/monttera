const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const commands = [
  'cd /home/digitalbordados/digitalbordados',
  'git stash',
  'git status'
];

console.log('Conectando via SSH para dar git stash em produção...');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH ready. Executando comandos...');
  conn.exec(commands.join(' && '), (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Comandos fechados com código: ' + code);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
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
