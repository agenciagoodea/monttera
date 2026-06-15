const { Client } = require('ssh2');
const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

// Comando para buscar especificamente por erros recentes no arquivo de logs de erro do PM2
const command = 'pm2 logs digitalbordados --lines 400 --raw --nostream | grep -i -E "error|exception|checkout|failed" | tail -n 100';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log(output || 'Nenhum log de erro recente encontrado com grep.');
      conn.end();
    }).on('data', (data) => {
      output += data.toString();
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
